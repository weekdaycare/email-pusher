FROM python:3.11-slim

WORKDIR /app

COPY main.py .
COPY email_template.html .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

ENTRYPOINT ["python", "/app/main.py"]
