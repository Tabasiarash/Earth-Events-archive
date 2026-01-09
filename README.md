🌍 Earth Events Archive

AI-Driven Geospatial Event Analysis Platform

📌 Project Overview 

Earth Events Archive is a research-oriented analytical platform that collects, processes, and visualizes real-world events such as political unrest, protests, and conflicts using open-source intelligence (OSINT) and AI-based media analysis.

The project demonstrates the application of data engineering, geospatial analytics, computer vision, and ethical AI to transform unstructured social and news data into structured, map-based insights.

🎯 Designed as a research and portfolio project
🚧 Actively under development
🔬 Initial case study: Iran (recent civil unrest)

💡 Research Problem

Global events generate massive volumes of unstructured data (text, images, videos) across social platforms and news outlets.
Key challenges include:

Extracting reliable signals from noisy sources

Converting qualitative reports into quantitative insights

Understanding geographical spread and intensity

Estimating crowd sizes without direct access to official data

This project addresses these challenges using data pipelines, AI models, and geospatial visualization.

🧠 Research Objectives

Build an automated OSINT pipeline

Normalize event data across heterogeneous sources

Apply computer vision for crowd estimation

Visualize event distribution using interactive maps

Enable statistical analysis of event dynamics over time

🔬 Methodology
1. Data Collection (OSINT)

Public data sources:

Telegram channels

Twitter / X

Instagram

Online news outlets

Extracted elements:

Timestamp

Location

Event category

Media (images/videos)

Source metadata

2. Data Processing & Enrichment

Text parsing & classification

Geo-location inference

Event clustering

Deduplication & noise reduction

3. AI & Computer Vision

Image & video analysis for:

Crowd density estimation

Participant count approximation

Model outputs expressed as confidence ranges, not absolute values

4. Geospatial Visualization

Event mapping using GIS tools

Heatmaps for intensity analysis

Temporal progression views

📊 Analytical Outputs

📈 Event frequency over time

🗺️ Geographic distribution & clustering

👥 Estimated participation ranges

📍 Regional escalation patterns

🧪 Dataset suitable for further research

🛠️ Technical Stack
Category	Tools
Programming	Python, JavaScript
Data	Pandas, NumPy
AI / CV	OpenCV, PyTorch / TensorFlow
Mapping	GeoJSON, Mapbox / Leaflet
Backend	Node.js / Python APIs
OSINT	Social media APIs, news scraping
🧪 Case Study: Iran (Initial Dataset)

Focused dataset used to:

Validate pipelines

Test AI crowd estimation

Analyze regional spread

Designed to be globally extensible to other regions and events

⚠️ Focus chosen purely for methodological validation, not political advocacy.

⚖️ Ethics & Responsible AI

Uses publicly available data only

No facial recognition or personal identification

Crowd estimates are approximate and anonymized

Clear separation between analysis and interpretation

📂 Project Structure
Earth-Events-archive/
├── collectors/        # OSINT data pipelines
├── processing/        # Cleaning & normalization
├── ai-analysis/       # Crowd estimation models
├── visualization/     # Map & dashboard
├── datasets/          # Structured research data
└── docs/              # Methodology & findings

🎯 Skills Demonstrated 

Data engineering & pipelines

OSINT research techniques

Computer vision & AI modeling

Geospatial analysis (GIS)

Statistical reasoning

Ethical AI design

Research documentation

Real-world problem solving

🚀 Future Work

Multi-region comparative analysis

Automated credibility scoring

Advanced temporal modeling

Public research dashboards

Dataset publication for academic use

👤 Author

Arash Tabasi
Data & AI Research | OSINT Analytics
GitHub: https://github.com/Tabasiarash
