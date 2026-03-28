# ntfy.sh - Beginner's Guide

**ntfy** (pronounced "notify") is a simple HTTP-based pub/sub notification service. Think of it like SMS, but free and programmable.

---

## What is ntfy?

ntfy lets you send push notifications to your phone/desktop by making a simple HTTP request. No accounts, no API keys, no setup - just POST a message to a URL.

```bash
curl -d "Hello!" ntfy.sh/my-topic
```

That's it. Your phone gets a notification.

---

## Quick Start (5 minutes)

### Step 1: Install the App

| Platform | Install |
|----------|---------|
| **Android** | [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy) or F-Droid |
| **iOS** | [App Store](https://apps.apple.com/app/ntfy/id1625396347) |
| **Desktop** | Web UI at [ntfy.sh](https://ntfy.sh) |

### Step 2: Subscribe to a Topic

1. Open the ntfy app
2. Tap **"+"** to add subscription
3. Enter a topic name: `my-research` (make it unique!)
4. Tap **Subscribe**

> ⚠️ **Important**: Topics are PUBLIC by default. Anyone who knows your topic name can send/receive messages. Use unique names like `john-research-2024` instead of `research`.

### Step 3: Send Your First Notification

```bash
curl -d "My first notification!" ntfy.sh/my-research
```

Your phone buzzes! 🎉

---

## Sending Notifications

### Basic Message
```bash
curl -d "Backup complete!" ntfy.sh/my-topic
```

### With Title
```bash
curl -H "Title: Server Alert" -d "CPU at 90%!" ntfy.sh/my-topic
```

### With Priority
Priorities: `min`, `low`, `default`, `high`, `urgent`

```bash
curl -H "Priority: urgent" -d "Server down!" ntfy.sh/my-topic
```

### With Tags (Emoji)
```bash
curl -H "Tags: warning,robot" -d "Backup failed" ntfy.sh/my-topic
```

Common tags: `white_check_mark` ✅, `warning` ⚠️, `x` ❌, `robot` 🤖, `tada` 🎉

### With Click Action (URL)
When user taps notification, open a URL:
```bash
curl -H "Click: https://example.com/report" -d "Report ready" ntfy.sh/my-topic
```

### All Options Combined
```bash
curl \
  -H "Title: Research Complete" \
  -H "Priority: high" \
  -H "Tags: tada,robot" \
  -H "Click: https://docs.google.com/document/d/xxx" \
  -d "AI Trends 2025 research is ready for review" \
  ntfy.sh/my-research
```

---

## Using in Code

### Bash Script
```bash
#!/bin/bash
TOPIC="my-research"

notify() {
    curl -s -H "Title: $1" -d "$2" "ntfy.sh/$TOPIC"
}

# Usage
notify "Build Status" "✅ Build succeeded!"
```

### TypeScript/Node.js
```typescript
async function sendNtfy(message: string, title?: string) {
    const topic = process.env.NTFY_TOPIC || 'default-topic';
    
    await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: title ? { 'Title': title } : {},
        body: message
    });
}

// Usage
await sendNtfy('Research complete!', '📚 AI Trends');
```

### Python
```python
import requests

def notify(message, title=None, priority='default'):
    topic = 'my-research'
    headers = {'Priority': priority}
    if title:
        headers['Title'] = title
    
    requests.post(f'https://ntfy.sh/{topic}', 
                  data=message.encode(), 
                  headers=headers)

# Usage
notify('Done!', title='Research', priority='high')
```

---

## rsrch Integration

We've integrated ntfy into the research CLI:

```bash
# Set your topic
export NTFY_TOPIC="my-research"

# Send notification
rsrch notify "Research complete" --title "AI Trends"

# With priority
rsrch notify "Urgent: Review needed" --priority urgent
```

---

## Self-Hosting (Optional)

If you want privacy, run your own ntfy server:

### Docker
```bash
docker run -p 8080:80 binwiederhier/ntfy serve
```

### Then point your app and scripts to it:
```bash
# In app: Settings → Add server → http://your-server:8080
# In scripts:
export NTFY_SERVER="http://your-server:8080"
```

---

## Security Tips

| Risk | Mitigation |
|------|------------|
| Topic guessing | Use long, random topic names: `research-abc123xyz` |
| Public messages | Self-host for sensitive data |
| Spam | Use authentication (paid or self-hosted) |

---

## Comparison with Alternatives

| Feature | ntfy | Discord | Email |
|---------|------|---------|-------|
| Setup time | 0 min | 5 min | 10+ min |
| Mobile push | ✅ | ✅ | ✅ |
| Free | ✅ | ✅ | ✅ |
| Self-hostable | ✅ | ❌ | Complex |
| Rich formatting | Basic | Rich | Rich |
| Requires account | ❌ | ✅ | ✅ |

---

## Common Use Cases

1. **Build notifications**: CI/CD sends "Build passed/failed"
2. **Research alerts**: "Deep research complete, audio ready"
3. **Server monitoring**: "Disk space low on server-1"
4. **Cron job status**: "Daily backup completed"
5. **IoT devices**: "Motion detected at front door"

---

## Troubleshooting

### Not receiving notifications?
1. Check app is subscribed to correct topic
2. Check battery optimization isn't killing the app
3. Try sending from web UI: ntfy.sh → Subscribe → Send test

### Permission denied?
```bash
# Make sure you're not using a reserved topic
# These are taken: "announcements", "stats", etc.
```

---

## Quick Reference Card

```bash
# Send simple message
curl -d "message" ntfy.sh/TOPIC

# With title
curl -H "Title: My Title" -d "message" ntfy.sh/TOPIC

# With priority (min/low/default/high/urgent)
curl -H "Priority: high" -d "message" ntfy.sh/TOPIC

# With emoji tags
curl -H "Tags: tada" -d "message" ntfy.sh/TOPIC

# Click to open URL
curl -H "Click: https://..." -d "message" ntfy.sh/TOPIC

# All together
curl -H "Title: Done" -H "Priority: high" -H "Tags: check" -d "msg" ntfy.sh/TOPIC
```
