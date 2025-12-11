---
status: Completed
finished: 2025-12-10
---
notebooklm
- [x] add option to give a custom prompt into the audio generation. there is builtin text filed for it. just use it.
- [x] add option to load sources from google drive. there is dedicated button for it with popup file picker. identify the documents by name or if possible by uid of the gdocs.
- [x] add the ability to download the audio file from the browser.
- improve the download audio function so i do not have to download all the audio every time. usually i will need only few of the last ones.



gemini.google
- [x] add support for sending messages into existing chat sessions. identify the sessions by their name and also support the option to select it by their id shown in the url (the last part of the url). and to retrieve the answer from the session.
  - ✅ CLI: `gemini send-message [SessionID] "Message"` - send message and get response
  - ✅ CLI: `gemini get-response [SessionID] [Index]` - retrieve specific response (1=first, -1=last)
  - ✅ CLI: `gemini get-responses [SessionID]` - retrieve all responses
  - ✅ Multi-turn chat verified working

  - ✅ CLI: `gemini deep-research "query" --local --headed`
  - ✅ Deep Research mode enabled (selects Thinking 3 Pro + Deep Research tool)
  - ✅ Research plan auto-confirmation working
  - ✅ Research completion detection working  
  - ✅ Export to Google Docs working
  - ✅ CLI: `rsrch gemini export-to-docs [sessionId] --local --headed`
  - ✅ Enable to get title and first heading lvl 1 from the deep research answered analysis report document (Done via `rsrch gemini get-research-info`)
  - ✅ Endpoint that will list all the documents created by the gemini deep research as an answers. Includes Title and first heading lvl 1. (Available via CLI `rsrch gemini list-research-docs` and POST `/gemini/list-research-docs`)
  - enable file upload to chat session like pdfs and pictures with upload local files option.
  - enable to import code from git repositories via the built-in file upload option.
  - enable the use of gemini gems. thet mean the customized chats with specific system prompt and files uploaded to the chat. 
  - enable creation and configuration of gemini gems. configuration meaning the system prompt and files uploaded to the chat. the config should be stored in a yaml file and should be configurable via cli.
  - enable to run a deep rsearch with gemini gem.
  

perplexity
- [x] enhance the export of answers by extracting also the sources discovered. naturaly with the links from the actual answer. maybe as an markdown file in which the sources would be added as footnotes for obsidian.![[Prods/01-pwf/agents/rsrch/image.png|perplexity model thoughts]]. In the picture are shown the intermediate thoughts of the model and at that time used links. so i want all this information to be extracted, even the positional. mening i want to se the information structures the same way as in the gui. like links used for each thoughts turn visibly connected. eg under the same subheading.
- [x] add support for sending messages into existing chat sessions. identify the sessions by their name and also support the option to select it by their id shown in the url (the last part of the url). and to retrieve the answer from the session.
  - ⚠️ **Issue**: Answer extraction in multi-turn threads is currently unstable (selector fragility).
  - [x] Fix Answer Extraction: Refactored poll loop to count answer containers and monitor the *new* one.

- [x] add support for creating new chat session with tool Deep Research turned on. 
    - [x] Identify "Deep Research" / "Pro" toggle selector
    - [x] Update `client.ts` to toggle Deep Research
    - [x] Add CLI flag `--deep`
    - [x] Verify with test query 

API:
- [x] make every deep research request nonblocking while waiting. maybe some que for the requests? 
    - [x] Create `job-queue.ts` with Job interface
    - [x] Implement async processing in `server.ts`
    - [x] Add `/jobs/:id` status endpoint
- [x] make it so i can send multiple quries/deepResearches to the server. the serve should answe imediately if the query is just simple one or in case of deepresearch it should answer with an responce from program that the query was submited succesfuly if it was done so. else an error.
- [x] add discord notifications for all running longrunning processes.
    - [x] Add webhook URL to config
    - [x] Send notification on job completion
- [x] in case of local headless browser make it so the browser stays on until explicit shutdown command and is not started fresh with every request.
    - [x] Add `keepAlive` option to client
    - [x] Add `rsrch shutdown` command
- add verbose logging in the cli so i can see how the request proceeds.
- make all existing functions available in both the rest api as well as in the cli. [SHOULD BE DONE EVERYTIME A NEW FUNCTION IS ADDED]
- [x] add endpoint which will take as input a research question. will do the research with both gemini and perplexity  then combines those results in a google doc. this one is then loaderd into the notebooklm and a audio for only that source is generated with custom prompt which could be gien as a parameter to the endpoint. And finally it saves the audio on a local storage. As it will run in docker there will be a mounted volume for saving the audio files. if it is successful i want to get an email onto the mail i am loged in with.
- [x] as the research and audio generation is long running process, can you do it so that the server can process other requests while the research is running and the audio is being generated?
- [x] Implement Discord notifications for long-running tasks (replacing email requirement).
- [x] Implement "Dry Run" mode for audio generation (mimic interaction without clicking generate) to save quota. Default to dry-run, require `--wet` flag for real generation.

DOCS:
- add clearly separated docs for the cli and the api.
