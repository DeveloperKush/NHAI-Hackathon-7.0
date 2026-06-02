import os
import re
import subprocess
from markdown_it import MarkdownIt

def render_md_to_beautiful_html(md_path, html_path):
    print(f"Reading markdown from {md_path}...")
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    # Parse Markdown to HTML
    print("Parsing markdown to HTML...")
    md = MarkdownIt()
    html_body = md.render(md_text)

    # Embed beautiful CSS styling
    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Technical Onboarding Guide</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

body {{
    font-family: 'Inter', sans-serif;
    color: #1e293b;
    line-height: 1.6;
    font-size: 14px;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
}}

.container {{
    max-width: 900px;
    margin: 0 auto;
    padding: 40px;
}}

h1, h2, h3, h4, h5, h6 {{
    font-family: 'Inter', sans-serif;
    color: #0f172a;
    font-weight: 700;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
    page-break-after: avoid;
}}

h1 {{
    font-size: 2.2em;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 0.3em;
    color: #1e3a8a;
    margin-top: 0;
}}

h2 {{
    font-size: 1.5em;
    color: #0f172a;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.2em;
    margin-top: 1.8em;
}}

h3 {{
    font-size: 1.2em;
    color: #0f766e;
}}

p {{
    margin-bottom: 1em;
}}

/* Code styling */
code {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9em;
    background-color: #f1f5f9;
    color: #0f172a;
    padding: 2px 6px;
    border-radius: 4px;
}}

pre {{
    background-color: #0f172a;
    color: #f8fafc;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85em;
    line-height: 1.5;
    margin-bottom: 1.5em;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-all;
}}

pre code {{
    background-color: transparent;
    color: inherit;
    padding: 0;
    border-radius: 0;
}}

/* Lists */
ul, ol {{
    margin-bottom: 1.2em;
    padding-left: 20px;
}}

li {{
    margin-bottom: 0.4em;
}}

/* Tables */
table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 2em;
    font-size: 0.9em;
    page-break-inside: avoid;
}}

th, td {{
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
}}

th {{
    background-color: #f8fafc;
    color: #475569;
    font-weight: 600;
    border-top: 1px solid #e2e8f0;
}}

tr:nth-child(even) {{
    background-color: #f8fafc;
}}

/* Blockquotes */
blockquote {{
    border-left: 4px solid #3b82f6;
    background-color: #eff6ff;
    color: #1e3a8a;
    margin: 1.5em 0;
    padding: 12px 20px;
    border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
}}

blockquote p {{
    margin-bottom: 0;
}}

/* Page break rules */
.page-break {{
    page-break-before: always;
}}

@page {{
    size: A4;
    margin: 20mm;
}}

@media print {{
    body {{
        font-size: 11pt;
    }}
    .container {{
        padding: 0;
        max-width: 100%;
    }}
}}
</style>
</head>
<body>
<div class="container">
{html_body}
</div>
</body>
</html>
"""
    
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"Beautiful HTML saved to {html_path}")

def run_headless_print(html_path, pdf_path):
    # Try Microsoft Edge first since it is standard on Windows
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    ]
    
    executable = None
    for p in edge_paths + chrome_paths:
        if os.path.exists(p):
            executable = p
            break
            
    if not executable:
        print("Error: Edge or Chrome executable not found!")
        return False
        
    print(f"Using browser: {executable}")
    
    abs_html = os.path.abspath(html_path)
    abs_pdf = os.path.abspath(pdf_path)
    
    # Run print-to-pdf command
    cmd = [
        executable,
        "--headless",
        "--disable-gpu",
        f"--print-to-pdf={abs_pdf}",
        f"file:///{abs_html}"
    ]
    
    print(f"Running command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"Success! PDF generated at {abs_pdf}")
        return True
    else:
        print(f"Error printing: {result.stderr}")
        return False

if __name__ == "__main__":
    md_file = "Technical_Onboarding_Guide.md"
    html_file = "Technical_Onboarding_Guide.html"
    pdf_file = "Technical_Onboarding_Guide.pdf"
    
    render_md_to_beautiful_html(md_file, html_file)
    run_headless_print(html_file, pdf_file)
