import sys

method_code = """
    async getPendingAudioByWindmillJobId(windmillJobId: string): Promise<PendingAudio | null> {
        if (!this.graph) throw new Error('Not connected');
        const result = await this._executeQuery<any[]>(`MATCH(pa: PendingAudio { windmillJobId: '${escapeString(windmillJobId)}' }) RETURN pa`);
        if (result.data && result.data.length > 0) {
            const node = result.data[0][0] || result.data[0];
            const props = node.properties || node;
            return {
                id: props.id,
                notebookTitle: props.notebookTitle,
                sources: JSON.parse(props.sources || '[]'),
                status: props.status,
                windmillJobId: props.windmillJobId,
                customPrompt: props.customPrompt,
                createdAt: props.createdAt,
                startedAt: props.startedAt,
                completedAt: props.completedAt,
                error: props.error,
                resultAudioId: props.resultAudioId
            };
        }
        return null;
    }
"""

with open('agents/rsrch/src/graph-store.ts', 'r') as f:
    content = f.read()

split_point = content.rfind('let graphStore')
if split_point == -1:
    split_point = content.rfind('export function')

if split_point != -1:
    brace_index = content.rfind('}', 0, split_point)
    if brace_index != -1:
        new_content = content[:brace_index] + method_code + content[brace_index:]
        with open('agents/rsrch/src/graph-store.ts', 'w') as f:
            f.write(new_content)
        print("Method inserted successfully.")
    else:
        print("Could not find class closing brace.")
else:
    print("Could not find export section.")
