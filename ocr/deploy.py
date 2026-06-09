from dotenv import load_dotenv
load_dotenv()
import runpod
import os,json, requests
import argparse

parser = argparse.ArgumentParser("A Script That Tests Runpod Endpoint")
parser.add_argument("--image_name", type=str, default="", help="Runpod Endpoint ID")

args = parser.parse_args()


runpod.api_key = os.environ.get("RUNPOD_API_KEY")
Template_key = os.environ.get('TEMPLATE_AUTH_KEY')
HEADERS = {"Authorization": f"Bearer {runpod.api_key}", "Content-Type": "application/json"}

try:
    try:
        # Creating a template to use with the new endpoint
        templete = runpod.create_template(
            name="Paddle_LM", image_name=args.image_name, is_serverless=True,
        )
        templte_id= templete["id"]
        data= {"containerRegistryAuthId": Template_key}
        resp = requests.patch(f"https://rest.runpod.io/v1/templates/{templte_id}",headers=HEADERS,json=data)
        print("Patch response:", resp.status_code, resp.text)
        # Output the created template details
        print(templete)
        

        # with open("runpod.env","a") as f:
        #     f.write(f"TEMPLETE_ID={templte_id}\n")
    except Exception as e:
        print("template exists, so using existing one")
        print(e)
        URL = f"https://rest.runpod.io/v1/templates"
        reesponse = requests.get(URL,headers=HEADERS)
        jd = json.loads(reesponse.content)
        for tempe in jd:
            print(tempe['id'], tempe['name'])
            if tempe['name'] == "Paddle_LM":
                templte_id = tempe['id']
                data= {"containerRegistryAuthId": Template_key}
                resp = requests.patch(f"https://rest.runpod.io/v1/templates/{templte_id}",headers=HEADERS,json=data)
                
                break
        
    print(f"Using template ID: {templte_id}")
    if templte_id is None:
        raise ValueError("Template ID could not be determined.")
    
    # Creating a new endpoint using the previously created template
    new_endpoint = runpod.create_endpoint(
        name="Paddle_LM",
        template_id=templte_id,
        gpu_ids="AMPERE_24",
        workers_min=0,
        workers_max=1,
    )

    # Output the created endpoint details
    print(new_endpoint)
    print(f"Endpoint deployed successfully with ID: {new_endpoint['id']}")

    with open("runpod.env","a") as f:
        f.write(f"ENDPOINT_ID={new_endpoint['id']}\n")
except runpod.error.QueryError as err:
    # Handling potential errors during endpoint creation
    print(err)
    print(err.query)