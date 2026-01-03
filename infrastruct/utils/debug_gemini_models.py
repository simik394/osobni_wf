
import os
import sys

# Add local libs to path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(script_dir, "libs"))

import google.generativeai as genai

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("No GEMINI_API_KEY set")
    sys.exit(1)

genai.configure(api_key=api_key)

print(f"Listing models with key: {api_key[:4]}...{api_key[-4:]}")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")
