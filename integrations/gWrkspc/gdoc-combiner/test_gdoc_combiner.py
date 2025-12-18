import urllib.request
import json
import sys
import re

def run_test(url, secret):
    print(f"Testing Endpoint: {url}")
    print("-" * 60)

    # 1. Ping
    if not ping(url, secret): return

    # 2. Create Test Docs
    print("\n[2] Creating Test Documents...")
    id1 = create_doc(url, secret, "Test Source 1", "Content of Source 1")
    id2 = create_doc(url, secret, "Test Source 2", "Content of Source 2")

    if not id1 or not id2:
        print("❌ Failed to create source documents.")
        return

    # 3. Combine Docs
    print("\n[3] Combining Documents...")
    combined_url = combine_docs(url, secret, [id1, id2], "Final Combined Doc")
    if not combined_url:
        return

    # Extract ID from URL
    combined_id = extract_id(combined_url)
    if not combined_id:
        print("❌ Could not extract ID from URL.")
        return

    # 4. Verify Content
    print("\n[4] Verifying Combined Content...")
    structure = get_structure(url, secret, combined_id)
    if not structure:
        return
    
    verify_combined_content(structure, ["Content of Source 1", "Content of Source 2"])

def ping(url, secret):
    print("   Pinging...", end=" ")
    res = send_request(url, {"action": "ping", "secret": secret})
    if res and res.get("status") == "success":
        print("✅ OK")
        return True
    print("❌ Failed")
    return False

def create_doc(url, secret, title, content):
    print(f"   Creating '{title}'...", end=" ")
    res = send_request(url, {
        "action": "createTestDoc",
        "secret": secret,
        "title": title,
        "content": content
    })
    if res and res.get("status") == "success":
        new_url = res.get("url")
        doc_id = extract_id(new_url)
        print(f"✅ Created ({doc_id})")
        return doc_id
    print(f"❌ Failed: {res}")
    return None

def combine_docs(url, secret, ids, title):
    print(f"   Combining {len(ids)} docs...", end=" ")
    res = send_request(url, {
        "action": "combineDocs",
        "secret": secret,
        "docIds": ids,
        "title": title
    })
    if res and res.get("status") == "success":
        print("✅ Success")
        print(f"   URL: {res.get('url')}")
        return res.get("url")
    print(f"❌ Failed: {res}")
    return None

def get_structure(url, secret, doc_id):
    print(f"   Fetching structure for {doc_id}...", end=" ")
    res = send_request(url, {
        "action": "getDocStructure",
        "secret": secret,
        "docId": doc_id
    })
    if res and res.get("status") == "success":
        print("✅ OK")
        return res.get("structure")
    print(f"❌ Failed: {res}")
    return None

def verify_combined_content(structure, expected_texts):
    tabs = structure.get("tabs", [])
    print(f"   Found {len(tabs)} tabs in result.")
    
    found_count = 0
    for i, tab in enumerate(tabs):
        print(f"   Tab {i+1}: '{tab.get('title')}'")
        elements = tab.get("elements", [])
        text_content = " ".join([e.get("text", "") for e in elements])
        print(f"     Content: {text_content[:50]}...")
        
        # Check if expected text is in this tab
        for text in expected_texts:
            if text in text_content:
                print(f"     ✅ Found expected text: '{text}'")
                found_count += 1
    
    if found_count >= len(expected_texts):
        print("\n✅ VERIFICATION PASSED: All source content found in result.")
    else:
        print(f"\n❌ VERIFICATION FAILED: Found {found_count}/{len(expected_texts)} expected texts.")

def extract_id(url):
    # Matches /d/ID/ or ?id=ID
    match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
    if match: return match.group(1)
    match = re.search(r'id=([a-zA-Z0-9-_]+)', url)
    if match: return match.group(1)
    return None

def send_request(url, payload):
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as f:
            return json.loads(f.read().decode('utf-8'))
    except Exception as e:
        print(f"Request Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_gdoc_combiner.py <WEB_APP_URL> [SECRET]")
        sys.exit(1)
    
    url = sys.argv[1]
    secret = sys.argv[2] if len(sys.argv) > 2 else "super-secret-password-123"
    run_test(url, secret)
