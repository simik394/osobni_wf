
> [!Log tags]-
> ```dataview
> table tags
> from "myDM/Logs/daily"
> where tags
> ```

> [!Websites -1n refs tags]-
> ```dataview
> table tags
> from "myDM/captured/Websites"
> where tags
> ```

> [!Docs --google tags]-
> ```dataview
> table tags
> from "myDM/Docs" and !#area/sw/google
> where tags
> ```

> [!sw/google]-
> ```dataview
> table
> from "myDM/Docs" and #area/sw/google



