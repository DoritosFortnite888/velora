# Online AI providers: research and comparison

This page compares hosted AI providers for Velora's online mode. It was researched in November 2026. The sources were third-party summaries and, where accessible, provider pages. **Verify every price, limit and policy on the provider's own page before you rely on it.** Several official pages were blocked to this research, so some figures below are from secondary sources and are marked that way.

## What matters for Velora

- **Roleplay quality.** Natural replies, consistent characters, and following a long chat. This is a judgment from general reputation, not a measurement in this project.
- **Speed.** Time to the first word, and how fast text streams.
- **Free tier.** Whether it works without a payment method, and how big the limits are.
- **Data use.** Whether the provider may use your prompts to improve its products. For private chats, this matters most.
- **Content rules.** Each provider filters output. Romance is allowed for adults in many places, but explicit content is not, and filters can block some romantic replies. Velora's own rules still apply.

## Comparison

| Provider | Free tier | Card needed? | Models on the free tier (as found) | Speed | Data use on free tier | Roleplay suitability | Notes |
|---|---|---|---|---|---|---|---|
| **Google Gemini API** (AI Studio key) | Yes | No (third-party summary, Nov 2026) | Gemini 2.5 Flash-Lite, 2.5 Flash, 2.5 Pro (listed), 3.x previews | Fast (Flash-Lite is the fastest of these) | **Yes, per Google's pricing page as summarised.** The same summary marks paid-tier content as not used this way | Good. Flash is stronger for long roleplay. Filters may block some romance | Per-model limits are no longer published; check the AI Studio console. **EU/EEA availability and the EEA data policy must be checked by you.** |
| **Groq** (OpenAI-compatible) | Yes | Not stated in the sources found | Open models, e.g. gpt-oss-120b and Qwen (sample table) | **Very fast** (the fastest of the group) | Not stated in the sources found | Good for short replies. Open models vary more in character consistency | Sample free limits: 30 requests/min, 1,000 requests/day, **200,000 tokens/day**. A Velora prompt with a full character card is likely over 1,000 tokens (an estimate), so this covers roughly 100 replies a day |
| **Mistral** (OpenAI-compatible) | Yes ("Experiment") | No card. Phone verification reported | Not published on the free plan | Medium | **Yes by default.** You can turn off "anonymous improvement data" in the Admin panel | Good | Free-plan limits are only visible after logging in |
| **OpenRouter** (OpenAI-compatible, many models) | Yes, models marked `:free` | No card for the free models | 20+ free models from several providers (changes often) | Varies by model | Depends on the model behind each route. Not stated in full | Varies | 50 requests/day without credits, 20/min. Free models can disappear or change |
| **OpenAI** (GPT models) | Not found as an ongoing free API tier | Payment needed | Paid models | Fast | Per OpenAI's terms | Very good | Paid. **Not selected**, because it requires payment |
| **Anthropic** (Claude API) | Not found as an ongoing free API tier | Payment needed | Paid models | Fast | Per Anthropic's terms | Very good | Paid. **Not selected**, because it requires payment |

## Recommendation for Velora

1. **Gemini 2.5 Flash-Lite** is the default in the proxy. It is free without a card in the sources found, fast, and good enough to test the whole flow. It is the smallest of the Gemini models here, so expect simpler replies.
2. **Gemini 2.5 Flash** is the better choice for quality, and it is also on the free tier as found. Change `MODEL` to `gemini-2.5-flash` if your free quota allows it.
3. **Groq** is the choice when speed matters more than long conversations and you accept a daily token cap. Set `PROVIDER=openai`, `API_BASE=https://api.groq.com/openai/v1`, and `MODEL` to a model Groq lists as available to you.

**Before you use any free tier for private chats**, read its data-use terms, check whether your region is covered, and decide whether the prompts you send are acceptable to share.

## Paid prices

Paid prices were not confirmed from an official page in this research. Check each provider's pricing page. Velora does not require payment for any option above. Do not set up billing without asking first.

## Sources

Read on 2026-11-11 to 2026-11-15, through third-party summaries and provider pages where accessible:

- Google Gemini free tier and data use: benchlm.ai free-tier summary of Google AI Studio (Nov 2026), and Google's rate-limit FAQ as quoted there. Google's own pricing page was not accessible to this research.
- Groq free plan: benchlm.ai free-tier summary of Groq (Nov 2026). Groq's own pricing page was not accessible.
- OpenRouter free models: OpenRouter's "Free LLM APIs Compared" article (2026).
- Mistral: developersdigest and costbench summaries, and Mistral's terms as quoted there.
- Cloudflare Workers free plan: third-party summaries of the free plan (about 100,000 requests a day). Confirm on Cloudflare's own limits page before deploying.
