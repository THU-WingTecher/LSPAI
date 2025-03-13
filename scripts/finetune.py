from openai import OpenAI

client = OpenAI()

job = client.fine_tuning.jobs.create(
    training_file="file-all-about-the-weather",
    model="gpt-4o-2024-08-06",
    method={
        "type": "dpo",
        "dpo": {
            "hyperparameters": {"beta": 0.1},
        },
    },
)


def upload_file(file_path):
    client = OpenAI()

    client.files.create(
        file=open(file_path, "rb"),
        purpose="fine-tune"
    )

def create_job(file_path):
    client = OpenAI()

    response = client.fine_tuning.jobs.create(
        training_file=file_path,
        model="gpt-4o-2024-08-06",
    )
    return response

def get_job(job_id):
    client = OpenAI()

    response = client.fine_tuning.jobs.retrieve(job_id)
    return response

def list_jobs():
    client = OpenAI()

    response = client.fine_tuning.jobs.list()
    return response

