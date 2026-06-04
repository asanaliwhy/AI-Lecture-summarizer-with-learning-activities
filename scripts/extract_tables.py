import docx
import os
import zipfile

docx_path = r'C:\Users\NURMA\Downloads\diploma-work.docx'
media_out_dir = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\media'
chapters_dir = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\chapters'

os.makedirs(media_out_dir, exist_ok=True)

# Extract images
with zipfile.ZipFile(docx_path) as z:
    for name in z.namelist():
        if name.startswith('media/') or name.startswith('word/media/'):
            base = os.path.basename(name)
            with open(os.path.join(media_out_dir, base), 'wb') as f:
                f.write(z.read(name))

# Read tables using python-docx
doc = docx.Document(docx_path)
tables_latex = []
for table in doc.tables:
    latex = '\\begin{table}[h!]\n\\centering\n\\begin{tabular}{|' + 'c|' * len(table.columns) + '}\n\\hline\n'
    for row in table.rows:
        row_data = [cell.text.strip().replace('\n', ' ').replace('%', '\\%').replace('&', '\\&').replace('_', '\\_') for cell in row.cells]
        latex += ' & '.join(row_data) + ' \\\\\n\\hline\n'
    latex += '\\end{tabular}\n\\caption{REPLACE_ME}\n\\end{table}\n'
    tables_latex.append(latex)

global_table_idx = 0
global_fig_idx = 0

# Read all lines of the chapter tex files
for root, dirs, files in os.walk(chapters_dir):
    for file in files:
        if file.endswith('.tex'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            new_content = ""
            for line in content.split('\n'):
                # Match "Table X — Title"
                if line.startswith('Table ') and '—' in line:
                    if global_table_idx < len(tables_latex):
                        latex_table = tables_latex[global_table_idx].replace('REPLACE_ME', line)
                        new_content += latex_table + "\n"
                        global_table_idx += 1
                    else:
                        new_content += line + "\n"
                
                # Match "Figure X — Title"
                elif line.startswith('Figure ') and '—' in line:
                    # simplistic image matching 1 to 1 based on appearance
                    # docx media files are often image1.png, image2.png
                    img_name = f'image{global_fig_idx+1}.png' if global_fig_idx+1 > 1 else 'image.png'
                    latex_fig = f"\\begin{{figure}}[h!]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{{../../media/{img_name}}}\n\\caption{{{line.replace('Figure ', '').split('—', 1)[-1].strip()}}}\n\\label{{fig:{global_fig_idx+1}}}\n\\end{{figure}}\n"
                    new_content += latex_fig + "\n"
                    global_fig_idx += 1
                else:
                    new_content += line + "\n"
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)

print(f"Extracted {len(tables_latex)} tables. Inserted {global_table_idx} tables and {global_fig_idx} figures.")
