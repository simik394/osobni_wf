import urllib.request
import json
import sys
import os

def run_test(url, secret):
    print(f"Testing Endpoint: {url}")
    print("-" * 60)

    # 1. Test Ping
    print("\n[1] Testing PING...")
    payload = {
        "action": "ping",
        "secret": secret
    }
    response = send_request(url, payload)
    if response and response.get("status") == "success":
        print("✅ Ping successful!")
    else:
        print("❌ Ping failed.")
        print(response)
        return

    # 2. Test List Docs
    print("\n[2] Testing LIST DOCS...")
    payload = {
        "action": "listDocs",
        "secret": secret,
        "limit": 5
    }
    response = send_request(url, payload)
    docs = []
    if response and response.get("status") == "success":
        docs = response.get("documents", [])
        print(f"✅ Listed {len(docs)} documents.")
        for d in docs:
            print(f"   - {d['title']} ({d['id']})")
    else:
        print("❌ List Docs failed.")
        print(response)
        return

    # 3. Test Get Doc Structure (using the first doc found)
    if docs:
        first_doc = docs[0]
        print(f"\n[3] Testing GET DOC STRUCTURE for '{first_doc['title']}'...")
        payload = {
            "action": "getDocStructure",
            "secret": secret,
            "docId": first_doc['id']
        }
        response = send_request(url, payload)
        if response and response.get("status") == "success":
            print("✅ Structure retrieved!")
            structure = response.get("structure", {})
            print(f"   Title: {structure.get('title')}")
            print(f"   Tabs: {len(structure.get('tabs', []))}")
            # Print first few children of first tab or body
            children = []
            if structure.get('tabs'):
                children = structure['tabs'][0].get('children', [])
                print(f"   (First Tab has {len(children)} elements)")
            elif structure.get('children'):
                children = structure.get('children', [])
                print(f"   (Body has {len(children)} elements)")
            
            # Show first 3 elements
            for i, child in enumerate(children[:3]):
                print(f"     [{i}] {child.get('type')}: {child.get('text', '')[:50]}...")
        else:
            print("❌ Get Structure failed.")
            print(response)

    # 4. Test Combine Docs
    if len(docs) < 2:
        print("\n⚠️ Not enough documents found to test combination (need at least 2).")
        return

    print("\n[4] Testing COMBINE DOCS...")
    # Pick the first two docs
    doc_ids = [docs[0]['id'], docs[1]['id']]
    print(f"   Combining: '{docs[0]['title']}' + '{docs[1]['title']}'")
    
    payload = {
        "action": "combineDocs",
        "secret": secret,
        "docIds": doc_ids,
        "title": "Automated Test Combined Doc"
    }
    
    response = send_request(url, payload)
    if response and response.get("status") == "success":
        print(f"✅ Combination successful!")
        print(f"   New Doc URL: {response.get('url')}")
    else:
        print("❌ Combine Docs failed.")
        print(response)

def send_request(url, payload):
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as f:
            res_body = f.read().decode('utf-8')
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code}")
        print(e.read().decode('utf-8'))
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_gdoc_combiner.py <WEB_APP_URL> [SECRET]")
        sys.exit(1)
    
    url = sys.argv[1]
    secret = sys.argv[2] if len(sys.argv) > 2 else "super-secret-password-123"
    
    run_test(url, secret)