---
description: Convert a Markdown file to a Notion page via CDP (Chrome DevTools Protocol)
argument-hint: <md-file-path> [notion-url] [--title "Title"] [--clear] [--property "Key=Value"]
allowed-tools:
  - Bash
  - Read
  - Glob
---

# MD to Notion via CDP

Convert and paste a Markdown file into a Notion page using Chrome DevTools Protocol.

## Prerequisites
- Chrome must be running with `--remote-debugging-port=9222`
- You must be logged into Notion in that Chrome instance

## Task

1. Parse the arguments from: $ARGUMENTS
2. If no arguments provided, ask the user for the MD file path
3. Run the conversion script:

```bash
node C:/gdpToNotion/src/index.js $ARGUMENTS
```

4. Report the results to the user, including:
   - Whether the paste was successful
   - How many chunks were used
   - Any errors or warnings

If the script fails due to Chrome not being connected, instruct the user to start Chrome with:
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Default Notion page: https://www.notion.so/devload/30e40edd3a66800dbdd9d5062d381426
