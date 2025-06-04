FROM python:3.11-slim

WORKDIR /github/workspace

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

ENTRYPOINT ["python", "main.py"]
