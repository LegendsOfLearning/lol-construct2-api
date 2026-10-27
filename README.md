# lol-construct2-api
This API allows game developers to use Construct 2 plugins to communicate with the LoL platform.
You test API changes as you go in the sample C2 game at ..\samples\lol-construct-api-sample.

## Resources
The Construct 2 documentation is excellent. Please see https://www.scirra.com/manual/69/plugins to understand how plugins work and how they are created and delivered. You need to grok this stuff before you start changing a plugin.

## Basic Development Process

Each plugin consists of five files:
* common.js - no use so far
* edittime.js - defines and documents the interface for the plugin
* runtime.js - implements the behavior of the plugin
* info.xml - meta data about the plugin. Must match the information in edittime.js.
* PluginIcon.ico - icon for the plugin

A plugin is added to a C2 project by dropping the c2addon file on the project. This installs it underneath the Construct 2 install path, as in:
C:\Program Files\Construct 2\exporters\html5\plugins\lol-questions

## Localized dialogue

`LoLMain.Phrase(key, fallback)` returns the player's translated text for a
phrase key, or the supplied fallback until that key is available. Use the
**Speak phrase** action with the same key to ask the player to play its
recording. The player controls the voice and audio fallback; the game does not
need to store or synthesize a voice.

The **On language received** condition fires when the player provides or
updates the language dictionary. Refresh any dialogue already on screen in
that event. A phrase key missing from the dictionary returns its fallback and
does not request speech. Register the keys and translations for the game
version before relying on localized text or audio.

**Has phrase** is true once the player supplies a key. For a dialogue event
that runs every frame, combine it with Construct's **Trigger once while true**
condition before using **Speak phrase**. This waits for the language data and
avoids restarting the recording every frame. Use a separate explicit event for
intentional replay.

Use **Stop phrase** when the game closes or stops a spoken dialogue. Keep the
game's existing effects and music controls in place; this action stops only
the player's current spoken phrase.

For a game with its own dialogue-volume slider, use **Set phrase volume**
with the same decibel value as the Construct Audio action. This requires a
player version that supports the `setSpeechVolume` message. It does not
replace the player's global mute control.

Since you are developing on a shared EC2 instance that is for C2 development the current files are already there.
