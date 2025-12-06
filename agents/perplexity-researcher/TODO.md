notebooklm
- [x] add option to give a custom prompt into the audio generation. there is builtin text filed for it. just use it.
- [x] add option to load sources from google drive. there is dedicated button for it with popup file picker. identify the documents by name or if possible by uid of the gdocs.
- [x] add the ability to download the audio file from the browser.



gemini.google
- add support for sending messages into existing chat sessions. identify the sessions by their name and also support the option to select it by their id shown in the url (the last part of the url). and to retrieve the answer from the session.
- add support for creating new chat session with tool Deep Research turned on. after submitting the question the wait for research plan is required. aftter it appears. just confirm it and then you can let it run in the background and handel other requests. but something needs to watch for the research to complete so you can send notification or the result itself. Actually after the resesarch is done. you have to click on the export/sharing oprtion to save the result as a google doc. that opens a new tab so you need to wait for it to load and after that to copy the id of created document ant to return it to the user.

perplexity
- add support for sending messages into existing chat sessions. identify the sessions by their name and also support the option to select it by their id shown in the url (the last part of the url). and to retrieve the answer from the session.
- add support for creating new chat session with tool Deep Research turned on. 

API:
- add verbose logging in the cli so i can see how the request proceeds.
- make all existing functions available in both the rest api as well as in the cli. [SHOULD BE DONE EVERYTIME A NEW FUNCTION IS ADDED]
- add endpoint which will take as input a research question. will do the research with both gemini and perplexity  then combines those results in a google doc. this one is then loaderd into the notebooklm and a audio for only that source is generated with custom prompt which could be gien as a parameter to the endpoint. And finally it saves the audio on a local storage. As it will run in docker there will be a mounted volume for saving the audio files. if it is successful i want to get an email onto the mail i am loged in with.
as the research and audio generation is long running process, can you do it so that the server can process other requests while the research is running and the audio is being generated?
