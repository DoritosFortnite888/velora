# OpenAI GPT open-weight models on iPhone 14: investigation

**Short answer.** GPT-OSS 20B cannot realistically run on an iPhone 14, and Velora does not offer it. The only genuine small OpenAI GPT open-weight models are the 2019 GPT-2 family, which were not trained to hold a character, so they are not usable for roleplay. Velora therefore uses the best compatible open-weight alternative, Llama 3.2 1B, and automatically chooses the smartest downloaded model that fits the device.

## How this was checked, and what was not

| Question | How it was checked | Result |
|---|---|---|
| Can the sandbox reach Hugging Face, npm, PyPI or jsDelivr? | Direct requests, twice | **No.** Every host failed to resolve. |
| Is a model runtime installed locally? | Searched npm and pip packages, and the filesystem | Only the browser test tools. No model runtime, no model files. |
| Do the published sizes add up? | Arithmetic in `js/core/sizing.js`, tested in `npm test` | Done. Figures below. |
| How do the existing Velora models compare to the arithmetic? | Same function | Llama 3.2 1B at 4 bits is about 591 MB of weights, inside Velora's 879 MB runtime figure, so the estimates are consistent. |
| Does GPT-OSS run on iPhone 14? | Arithmetic against iPhone 14 memory | **No**, see below. |
| Can the GPT-OSS weights be loaded in Velora's runtime? | Not possible here: no network, no model files | **Not tested.** |

**From memory, not checked in this session, and worth verifying against the model cards before relying on them:** the release dates and licences of the GPT-OSS models (Apache 2.0, released August 2025), their parameter counts (21B and 117B total, about 3.6B and 5.1B active per token), the 120B and 20B published checkpoint sizes, the iPhone 14's 6 GB of RAM, and the GPT-2 family sizes and licence (MIT, 2019).

## Findings for each candidate

### GPT-OSS 20B: no
- The model has about 21 billion parameters. Only about 3.6 billion are active per token, but every expert has to be in memory to pick the one a token needs. The mixture-of-experts design saves compute, not storage.
- Even at 4.25 bits per weight, the weights alone come to **about 10,640 MB** (computed by `weightsMB(21, 4.25)`). The published checkpoint is larger, about 13 GB from memory, because some tensors are stored at higher precision.
- An iPhone 14 has 6 GB of RAM in total, shared with iOS and every other app. A Safari tab cannot use all of it. Velora's own budget for a model on iPhone is **1,200 MB**. The GPT-OSS 20B weights are about nine times that.
- Lowering the quantization does not fix this. To fit 1,200 MB, the weights would need about 0.9 bits per weight, which is far below what keeps a model coherent.
- Streaming experts from flash storage, as some desktop runtimes do, is not available inside a web page, and would be too slow on a phone to hold a conversation.
- Separately, the model needs OpenAI's "harmony" response format and a separate reasoning output. A generic chat template would not produce correct replies.

**Verdict:** not realistic on iPhone 14. Velora does not offer it.

### GPT-OSS 120B: no
About 59,000 MB of weights at 4.25 bits, which is tens of gigabytes. Not possible on a phone.

### GPT-OSS-Safeguard 20B: no
From memory, this is an OpenAI safety classifier built on GPT-OSS. It is the same size as GPT-OSS 20B and is not a chat model for characters.

### GPT-2 family (124M to 1.5B): genuine, but not usable for roleplay
- These are real OpenAI GPT open-weight models, released under a permissive licence in 2019. The XL size (1.5B) is about 805 MB at 4.5 bits, which fits the iPhone budget.
- They were not instruction-tuned and do not follow a chat format, so they do not hold a character or answer a message reliably. Velora does not offer them.
- No runtime that Velora uses has a verified GPT-2 build. Adding one would be untested code.

### GPT-1: not offered
Historical and far too weak for chat.

## Runtimes and quantization

- **Velora's runtime** is WebLLM, pinned to version 0.2.79. WebLLM runs only on WebGPU. This environment could not check its prebuilt model list, so **whether it lists any GPT-OSS build is not known**. Velora checks each model id before a download and refuses an unknown one, so an unlisted model fails safely.
- **llama.cpp, MLX and Ollama** are the desktop runtimes that support GPT-OSS. None of them runs in an iPhone Safari tab, so they are not an option for Velora as it is built.
- **Quantization.** GPT-OSS ships its expert weights in a 4-bit block format (MXFP4). A browser build would need its own conversion and a WebGPU kernel for that format. Neither exists in Velora.
- **WebGPU buffer limits.** Even when total memory fits, each individual tensor buffer must fit the GPU's maximum buffer size. Velora checks that limit, but its real value on iOS is unknown here.

## Recommendation

1. **Keep Llama 3.2 1B as the recommended model** for an iPhone 14, and Qwen2.5 0.5B as the fallback. Both are already in Velora. Neither has been run on a phone. The browser tests exercise the Qwen 0.5B flow with a stub model, not the Llama models.
2. **Automatic choice** picks the smartest model that is already downloaded and fits the device. On an iPhone, Qwen2.5 1.5B is skipped because one third-party report found it failed to load, and Llama 3.2 3B is skipped because it is too large for a Safari tab.
3. **Candidates to test later** (not added, because their ids could not be checked here): small Apache 2.0 instruction models such as SmolLM2 1.7B and the Qwen3 small models, if the pinned WebLLM build lists them. Each would need an id check, a size check and an on-device test before it is offered.

## What would change this answer

- A WebGPU runtime that streams expert weights from storage at useful speed on iOS. None exists in Velora.
- An OpenAI GPT open-weight model much smaller than 1 billion parameters that holds a character well. None is known to exist.
- A measured iPhone 14 memory figure for a Safari tab that is well above 1,200 MB. Velora cannot read this from the web page.

## Next step if you want to test GPT-OSS yourself

On a laptop with 16 GB or more of memory, run GPT-OSS 20B with llama.cpp or Ollama and record the memory it uses and the reply quality. That tells you how the model behaves, not whether it fits a phone. The phone answer stays no unless the numbers above change.
