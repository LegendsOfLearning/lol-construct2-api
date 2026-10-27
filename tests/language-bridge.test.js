'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function makeRuntime() {
  const source = fs.readFileSync('plugins/lol-main/files/lol-main/runtime.js', 'utf8');
  // The vendor SDK is embedded before the C2 plugin. Exercise the real plugin
  // body with its public SDK surface stubbed, so no browser or vendor call runs.
  const body = source.slice(source.indexOf('cr.plugins_.LoLMain = function(runtime)'));
  const listeners = new Set();
  const messages = [];
  const triggers = [];
  const parent = { postMessage: (message, target) => messages.push({ message, target }) };
  const window = {
    parent,
    LOLSDK: { addLifecycleListener() {} },
    addEventListener: (name, fn) => { if (name === 'message') listeners.add(fn); },
    removeEventListener: (name, fn) => { if (name === 'message') listeners.delete(fn); },
  };
  const cr = { plugins_: {} };
  vm.runInNewContext(body, { cr, window, console, Object, JSON, Array });
  const runtime = { trigger: (condition, instance) => triggers.push({ condition, instance }) };
  const plugin = new cr.plugins_.LoLMain(runtime);
  const type = new plugin.Type(plugin);
  const instance = new plugin.Instance(type);
  instance.onCreate();
  const receive = (source, data) => [...listeners].forEach(fn => fn({ source, data }));
  const phrase = (key, fallback) => {
    let value;
    plugin.exps.Phrase.call(instance, { set_string: x => { value = x; } }, key, fallback);
    return value;
  };
  return { plugin, instance, parent, messages, triggers, receive, phrase, listeners };
}

test('host language supplies translated text and selected-voice key', () => {
  const t = makeRuntime();
  assert.equal(t.phrase('greeting', 'Hello'), 'Hello');
  assert.equal(t.plugin.cnds.HasPhrase.call(t.instance, 'greeting'), false);
  t.receive(t.parent, { messageName: 'language', payload: JSON.stringify({ language: 'es', greeting: 'Hola' }) });
  assert.equal(t.phrase('greeting', 'Hello'), 'Hola');
  assert.equal(t.plugin.cnds.HasPhrase.call(t.instance, 'greeting'), true);
  assert.equal(t.triggers.length, 1);
  assert.equal(t.triggers[0].condition, t.plugin.cnds.OnLanguageReceived);
  t.plugin.acts.SpeakPhrase.call(t.instance, 'greeting');
  assert.equal(JSON.stringify(t.messages), JSON.stringify([{ message: { message: 'speakText', payload: { key: 'greeting' } }, target: '*' }]));
  t.plugin.acts.StopPhrase.call(t.instance);
  assert.equal(JSON.stringify(t.messages[1]), JSON.stringify({ message: { message: 'speakTextCancel' }, target: '*' }));
  t.plugin.acts.SetPhraseVolume.call(t.instance, -20);
  assert.equal(t.messages[2].message.message, 'setSpeechVolume');
  assert.ok(Math.abs(t.messages[2].message.payload.volume - 0.1) < 1e-12);
  t.plugin.acts.SetPhraseVolume.call(t.instance, -Infinity);
  assert.equal(t.messages[3].message.payload.volume, 0);
  t.plugin.acts.SetPhraseVolume.call(t.instance, NaN);
  assert.equal(t.messages.length, 4);
});

test('unknown keys, malformed messages and other frames cannot cause speech', () => {
  const t = makeRuntime();
  t.receive({}, { messageName: 'language', payload: '{"greeting":"wrong"}' });
  t.receive(t.parent, { messageName: 'language', payload: '{bad json' });
  t.receive(t.parent, { messageName: 'language', payload: '[]' });
  assert.equal(t.triggers.length, 0);
  assert.equal(t.phrase('greeting', 'Hello'), 'Hello');
  t.plugin.acts.SpeakPhrase.call(t.instance, 'greeting');
  assert.equal(t.messages.length, 0);
});

test('later language replaces the dictionary and destruction removes listener', () => {
  const t = makeRuntime();
  t.receive(t.parent, { messageName: 'language', payload: { greeting: 'Hola', old: 'old' } });
  t.receive(t.parent, { messageName: 'language', payload: { greeting: 'Bonjour', number: 10 } });
  assert.equal(t.phrase('greeting', 'Hello'), 'Bonjour');
  assert.equal(t.phrase('old', 'fallback'), 'fallback');
  assert.equal(t.phrase('number', 'fallback'), 'fallback');
  t.instance.onDestroy();
  assert.equal(t.listeners.size, 0);
  t.receive(t.parent, { messageName: 'language', payload: { greeting: 'changed' } });
  assert.equal(t.phrase('greeting', 'Hello'), 'Bonjour');
});

test('Construct editor registers names implemented by the runtime', () => {
  const t = makeRuntime();
  const registrations = [];
  const context = {
    AddCondition: (...args) => registrations.push(['condition', args.at(-1)]),
    AddAction: (...args) => registrations.push(['action', args.at(-1)]),
    AddExpression: (...args) => registrations.push(['expression', args.at(-2)]),
    AddStringParam() {}, AddNumberParam() {}, ACESDone() {},
    cf_trigger: 1, cf_none: 0, af_none: 0, ef_return_string: 2, ept_integer: 0,
    cr: { Property: function () {} },
  };
  const source = fs.readFileSync('plugins/lol-main/files/lol-main/edittime.js', 'utf8');
  vm.runInNewContext(source, context);
  assert.ok(registrations.some(([kind, name]) => kind === 'condition' && name === 'OnLanguageReceived'));
  assert.ok(registrations.some(([kind, name]) => kind === 'condition' && name === 'HasPhrase'));
  assert.ok(registrations.some(([kind, name]) => kind === 'action' && name === 'SpeakPhrase'));
  assert.ok(registrations.some(([kind, name]) => kind === 'action' && name === 'StopPhrase'));
  assert.ok(registrations.some(([kind, name]) => kind === 'action' && name === 'SetPhraseVolume'));
  assert.ok(registrations.some(([kind, name]) => kind === 'expression' && name === 'Phrase'));
  assert.equal(typeof t.plugin.cnds.OnLanguageReceived, 'function');
  assert.equal(typeof t.plugin.cnds.HasPhrase, 'function');
  assert.equal(typeof t.plugin.acts.SpeakPhrase, 'function');
  assert.equal(typeof t.plugin.acts.StopPhrase, 'function');
  assert.equal(typeof t.plugin.acts.SetPhraseVolume, 'function');
  assert.equal(typeof t.plugin.exps.Phrase, 'function');
});
