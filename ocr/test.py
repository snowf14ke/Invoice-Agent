import os, base64, requests,pathlib,time,json
import argparse

RUNPOD_API_KEY = os.environ.get("TEST_KEY", "")
if RUNPOD_API_KEY=="":
    print("missing API key")

ENDPOINT_NAME = "Paddle_LM"
HEADERS = {"Authorization": f"Bearer {RUNPOD_API_KEY}", "Content-Type": "application/json"}

def get_endpoint():
    URL = f"https://rest.runpod.io/v1/endpoints"
    reesponse = requests.get(URL,headers=HEADERS)
    jd = json.loads(reesponse.content)
    for endpoint in jd:
        print(endpoint['id'], endpoint['name'])
        if endpoint['name'] == ENDPOINT_NAME:
            return endpoint['id']
    return None

RUNPOD_ENDPOINT_ID = get_endpoint()
if RUNPOD_ENDPOINT_ID is None:
    print("missing endpoint id")
    exit(0)
URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync"



def handler():
    nowtime= time.perf_counter()
    b64 = base64.b64encode(pathlib.Path("c1.png").read_bytes()).decode()
    # url = "something s3"
    # payload = {"input":{"image": f"{url}"}}
    payload = {"input":{"image": f"data:image/png;base64,{b64}","task": "ocr", "max_new_tokens":512}}
    
    print(time.perf_counter() - nowtime)

    r = requests.post(URL, headers=HEADERS, json=payload, timeout=300)
    print(time.perf_counter()-nowtime)
    r.raise_for_status()
    out = r.json().get("output", r.json())
    return out#{"statusCode": 200, "body": json.dumps(out)}

def main():
    result = handler()
    print("Result:", result)

if __name__ == '__main__':
    main()