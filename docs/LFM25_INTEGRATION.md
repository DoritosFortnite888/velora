# LFM2.5 1.2B Instruct (Liquid AI): integration status

**Status: prepared, not offered.** LFM2.5 1.2B Instruct is listed as a candidate in `js/core/config.js` and shown on the Models page as "Not offered yet". It cannot be downloaded, chosen by automatic choice, or loaded. Nothing about it has been tested in this build. **No iPhone 14 compatibility is claimed.**

## Why it is not offered yet

This environment had no internet access. Every model host, npm, PyPI and GitHub failed to resolve, so the following could not be done here:

- download the model files or read their sizes
- check whether the pinned WebLLM 0.2.79 package has a build for this architecture
- load the model or generate any text
- test on iPhone 14, iOS Safari or WebGPU
- test roleplay quality or long conversations
- read the licence text

Velora's rule is that a model is offered only after its runtime build and files are confirmed. The catalog test enforces it, so an unverified model cannot reach the download list by accident.

## What is known (from memory, not checked here)

- Liquid AI's LFM2 family is a set of small models whose architecture mixes short convolutions with attention. It was designed for devices with limited memory.
- The name "LFM2.5 1.2B Instruct" was supplied in the request. The details of that release were not confirmed here.
- The licence is a custom Liquid AI licence, not Apache 2.0 or the Llama licence. It must be read before any use.
- Liquid AI has published ONNX builds of LFM2 models. Whether a browser runtime loads them is not known.

## Compatibility checklist

| Question | Status |
|---|---|
| A WebLLM 0.2.79 build exists for this architecture | **Unknown.** Run `node scripts/verify-model.mjs lfm2.5-1.2b` to check. |
| The Hugging Face repo id is correct | **Unknown.** The config holds a guess (`LiquidAI/LFM2.5-1.2B-Instruct`) that the script checks. |
| The licence allows the intended use | **Not read.** |
| WebGPU works in iOS 26 Safari | **Not tested.** |
| The GPU offers 16-bit shaders on iPhone 14 | **Not tested.** Without them Velora uses the 32-bit build. |
| Each GPU buffer fits the iPhone limit | **Not tested.** |
| The model fits the iPhone memory budget | **Not measured.** The estimate is below. |
| Offline use after download | **Not tested.** |

## Quantization, memory and speed

- **Weights estimate.** `weightsMB(1.2, 4.5)` gives about 642 MB at 4-bit with scales (`js/core/sizing.js`). This counts weights only.
- **Runtime overhead.** Velora's existing Llama 3.2 1B figures show the runtime adds about half again on top of the weights (879 MB runtime against 591 MB of weights). Applying the same ratio gives about 960 MB. That is a rough estimate, below Velora's iPhone budget of 1,200 MB, and **it is not a measurement**.
- **Build choice.** A WebGPU build would use 4-bit weights. The 16-bit and 32-bit builds differ mainly in the arithmetic precision, which affects speed and GPU memory. Velora picks the 16-bit build when the GPU supports it, as it does for the other models.
- **Speed.** Not measured, and no speed claim is made. The Profile page's speed test is how to measure it on a phone.

## Runtime options if WebLLM has no build

1. **Wait for WebLLM.** Check each new pinned version with the verifier before changing `WEBLLM_VERSION`.
2. **ONNX Runtime Web with WebGPU, or transformers.js.** These are the browser runtimes that could load Liquid's ONNX builds. This is not implemented. It needs a model loader, a tokenizer, the LFM chat template, and a WebGPU execution provider, all of which would be untested code, so it was not added here.

## Test plan to run on a phone (not yet run)

1. **Compatibility.** Profile page reports WebGPU, the adapter, 16-bit shader support and buffer limits. Record them.
2. **Loading.** Download LFM2.5 1.2B once, on Wi-Fi, then load it. Note the time and whether Safari reloads the page.
3. **Generation.** Send "Hello, how are you?" and record time to first word and writing speed (Profile › Speed › Run speed test).
4. **Roleplay quality.** Use a character with two traits (for example Shy and Playful). Send each message below, then judge the reply on a 1 to 5 scale for: stays in character, reacts to the exact action, keeps spoken words in quotes, avoids assistant phrasing, and keeps the scene consistent.

| Message | What to check |
|---|---|
| Hi, how are you? | Greets in character, not as an assistant |
| *opens the door and steps in* | Reacts to the door, not a generic greeting |
| I try to grab her hand. | Pulls back or accepts in character |
| I suddenly punch the wall. | Reacts to the noise and the wall, no gore |
| I run away. | Notices the movement, no lecture |
| I hug you tight. | Friendly if romance is off, within level if on |
| I'm going to eliminate you. | Treats it as fiction, no safety lecture |
| I'm scared, someone is following me. | Shows fear through body and voice |
| You look really nice tonight. | Warm, in character |
| You're wrong and you know it. | Argues back in character |

5. **Long conversation.** Hold a 40-message chat. At message 30, ask about something said at message 3. Record whether the reply is consistent. Repeat the check for the scene: where the character is standing.
6. **Regression.** Confirm Llama 3.2 1B and Qwen2.5 0.5B still load and reply. Velora keeps both until LFM2.5 passes steps 1 to 5 reliably.

## Preservation

Characters, chats, memories and the database are unchanged. The candidate lives in config and changes no stored data.

## What is not done

No download, no load, no generation, no roleplay test, no long-conversation test, no iPhone test, and no ONNX or transformers.js code path. The verifier's success path is also untested: it depends on the npm tarball layout and the Hugging Face API response, which can only be checked with network access.
