import docx
import os

docx_path = r'C:\Users\NURMA\Downloads\diploma-work.docx'
chapters_dir = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\chapters'

# First, collect all cell text from docx tables that wound up as plain text
doc = docx.Document(docx_path)
table_cell_blocks = [] # list of lists of strings
for table in doc.tables:
    cells_text = []
    for row in table.rows:
        for cell in row.cells:
            # Split by newline because extract_docx extracted paragraphs as newlines
            for line in cell.text.strip().split('\n'):
                if line.strip():
                    cells_text.append(line.strip().replace('%', '\\%').replace('&', '\\&').replace('_', '\\_'))
    table_cell_blocks.append(cells_text)

# We want to match these blocks of text in our chapter files and remove them.
for root, dirs, files in os.walk(chapters_dir):
    for file in files:
        if file.endswith('.tex'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Remove any line that is exactly one of the raw cell texts AND is clustered near a table.
            # Actually, a simpler approach: 
            # If we find a line that perfectly matches a table cell, it's very likely the raw table dump.
            # But let's build a set of all raw cell strings to be safe.
            raw_strings = set()
            for block in table_cell_blocks:
                for s in block:
                    raw_strings.add(s)
            
            new_lines = []
            for line in lines:
                l_strip = line.strip()
                if l_strip in raw_strings and not l_strip.startswith("\\"):
                    # skip this blank or raw cell line
                    # wait, some single words might be matched. Let's make sure we only removed lines
                    # that are part of a continuous block of raw strings if possible, or just exact match.
                    # "Criteria" is one of them. "Moderate", "High", "Low", "Excellent". 
                    pass
                else:
                    new_lines.append(line)
                    
            with open(path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)

print("Cleaned raw text!")
