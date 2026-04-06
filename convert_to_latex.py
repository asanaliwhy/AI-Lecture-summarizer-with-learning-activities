import re
import os

text_file = r'c:\Users\NURMA\OneDrive\Рабочий стол\projects\DIPLOMA\extracted_diploma.txt'
out_dir = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\chapters'

with open(text_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

def clean(text):
    return text.strip()

chapters = []
current_chapter = None
current_content = []

# Abstract parsing
abstracts = {"en": [], "kz": [], "ru": []}
current_abstract = None

i = 0
while i < len(lines):
    line = lines[i].strip()
    
    if line == "ABSTRACT":
        current_abstract = "en"
    elif line == "АҢДАТПА":
        current_abstract = "kz"
    elif line == "АННОТАЦИЯ":
        current_abstract = "ru"
    elif line == "INTRODUCTION":
        current_abstract = None
        current_chapter = "INTRODUCTION"
        current_content = []
    elif line == "LITERATURE REVIEW":
        chapters.append((current_chapter, current_content))
        current_chapter = "LITERATURE REVIEW"
        current_content = []
    elif line == "3. ANALYSIS OF EXISTING SYSTEMS":
        chapters.append((current_chapter, current_content))
        current_chapter = "ANALYSIS OF EXISTING SYSTEMS"
        current_content = []
    elif line == "4. Data Collection":
        chapters.append((current_chapter, current_content))
        current_chapter = "Data Collection"
        current_content = []
    elif line == "5. METHODOLOGY":
        chapters.append((current_chapter, current_content))
        current_chapter = "METHODOLOGY"
        current_content = []
    elif line == "6.MVP, UML DIAGRAMS, AND ARCHITECTURE":
        chapters.append((current_chapter, current_content))
        current_chapter = "MVP, UML DIAGRAMS, AND ARCHITECTURE"
        current_content = []
    elif line == "7. TECHNOLOGY COMPARISON":
        chapters.append((current_chapter, current_content))
        current_chapter = "TECHNOLOGY COMPARISON"
        current_content = []
    elif line == "RESULTS AND DISCUSSION":
        chapters.append((current_chapter, current_content))
        current_chapter = "RESULTS AND DISCUSSION"
        current_content = []
    elif line == "9. REFERENCES":
        chapters.append((current_chapter, current_content))
        current_chapter = "REFERENCES"
        current_content = []
    else:
        if current_abstract:
            abstracts[current_abstract].append(line)
        elif current_chapter:
            current_content.append(line)
            
    i += 1
    
if current_chapter:
    chapters.append((current_chapter, current_content))

# Write abstract.tex
abstract_tex = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\frontmatter\abstract.tex'
with open(abstract_tex, 'w', encoding='utf-8') as f:
    f.write("\\chapter*{Abstract}\n\\addcontentsline{toc}{chapter}{Abstract}\n\\begin{SingleSpace}\n")
    f.write("\n\n".join([x for x in abstracts["en"] if x]) + "\n")
    f.write("\\end{SingleSpace}\n\n")
    
    f.write("\\chapter*{Аңдатпа}\n\\addcontentsline{toc}{chapter}{Аңдатпа}\n\\begin{SingleSpace}\n")
    f.write("\n\n".join([x for x in abstracts["kz"] if x]) + "\n")
    f.write("\\end{SingleSpace}\n\n")

    f.write("\\chapter*{Аннотация}\n\\addcontentsline{toc}{chapter}{Аннотация}\n\\begin{SingleSpace}\n")
    f.write("\n\n".join([x for x in abstracts["ru"] if x]) + "\n")
    f.write("\\end{SingleSpace}\n\n")

# Write chapters
for idx, (title, content) in enumerate(chapters):
    if title == "REFERENCES":
        continue # handled separately if needed
        
    chapter_dir = os.path.join(out_dir, f"chapter{idx+1:02d}")
    os.makedirs(chapter_dir, exist_ok=True)
    
    tex_file = os.path.join(chapter_dir, "main.tex")
    with open(tex_file, 'w', encoding='utf-8') as f:
        title_cased = title.title() if not title.isupper() else title.capitalize()
        # Clean title (e.g., "3. ANALYSIS OF EXISTING SYSTEMS" -> "Analysis Of Existing Systems")
        title_clean = re.sub(r'^\d+\.\s*', '', title_cased)
        f.write(f"\\chapter{{{title_clean}}}\n\\label{{chap:{idx+1:02d}}}\n\n")
        
        for p in content:
            if not p:
                continue
            
            # Detect section
            sec_match = re.match(r'^(\d+\.\d+)\.?\s+(.+)$', p)
            if sec_match:
                f.write(f"\n\\section{{{sec_match.group(2)}}}\n")
            else:
                # Escape special latex chars
                p = p.replace('%', '\\%').replace('&', '\\&').replace('_', '\\_')
                f.write(f"{p}\n\n")

print(f"Generated {len(chapters)-1} chapters.")
