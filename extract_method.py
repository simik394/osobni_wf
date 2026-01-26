import re

with open('/tmp/pr20_gemini.ts', 'r') as f:
    content = f.read()

# Extract setModel method
# It starts with "async setModel(modelName: string): Promise<boolean> {"
# And ends with matching brace.
match = re.search(r'async setModel\(modelName: string\): Promise<boolean> \{', content)
if match:
    start = match.start()
    brace_count = 0
    end = 0
    found_start = False
    for i in range(start, len(content)):
        if content[i] == '{':
            brace_count += 1
            found_start = True
        elif content[i] == '}':
            brace_count -= 1

        if found_start and brace_count == 0:
            end = i + 1
            break

    print(content[start:end])
