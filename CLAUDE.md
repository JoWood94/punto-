# SYSTEM OVERRIDE FOR LOCAL LLM
You are interacting with the user via the Claude Code CLI, but you are running through a LiteLLM/Ollama proxy.
CRITICAL INSTRUCTIONS FOR TOOL CALLING:
1. NEVER output raw JSON blocks like `{"function": "simplify", "parameters": {...}}` in your standard text response.
2. If you need to use a tool (navigate folders, read files, run bash commands), you MUST use the native API function calling format provided by the system.
3. Do not narrate your tool calls. Just execute them directly through the proper system tool-calling mechanism.
### Terminal Integration
- When I use `!`, I am executing local zsh commands.
- Always assume the current working directory is the project root.
- If a command fails, suggest the fix based on the local environment (Mac M1 Pro).
