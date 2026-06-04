import os
import re

chapters_dir = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\chapters'

def fix_heading(match):
    # match.group(1) is the content inside \section{...}
    content = match.group(1)
    
    # We look for a pattern where a heading structure like "Structure of the Thesis" 
    # is immediately followed by a sentence starting with a capital letter "This...".
    # e.g., "Structure of the Thesis This thesis is organized..."
    # or "1.1 Background Context The development of..." 
    
    # Attempt to split on a lowercase letter followed by a space and a Capital letter.
    # e.g., "Thesis This" -> "Thesis", "This"
    # To be safe, let's use a regex to find the first transition from a lowercase word 
    # to a capitalized word that looks like a sentence start, OR just check if the section is too long.
    
    # Let's find common anomalies
    split_match = re.search(r'([a-z>”)])\s+([A-Z][a-z]+.*)$', content)
    
    # "Structure of the Thesis This thesis..."
    # split_match group 1 = "s", group 2 = "This thesis..."
    if split_match and len(content) > 40:
        idx = split_match.start(2)
        title = content[:idx].strip()
        body = content[idx:].strip()
        return f"\\section{{{title}}}\n{body}"
    
    return f"\\section{{{content}}}"


for root, dirs, files in os.walk(chapters_dir):
    for file in files:
        if file.endswith('.tex'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            new_lines = []
            in_list = False
            
            for i, line in enumerate(lines):
                # 1. Fix runaway headings in \section{...}
                line = re.sub(r'\\section\{([^}]+)\}', fix_heading, line)
                
                # 2. Fix bullet points.
                # Common pattern: lines ending in ';' or starting with lowercase after a ':'
                # Let's see if the line ends with ';' or ends with '.' but is part of a list.
                # Actually, in the screenshot, the list lines start with lowercase.
                l_strip = line.strip()
                
                # If it's a list item candidate (ends with ';' or is in a block of them)
                if (l_strip.endswith(';') or l_strip.endswith(';')) and len(l_strip) > 5 and not l_strip.startswith('\\'):
                    if not in_list:
                        new_lines.append("\\begin{itemize}\n")
                        in_list = True
                    new_lines.append(f"\\item {line}")
                
                # What about the last item ending in '.'?
                elif in_list and (l_strip.endswith('.') or len(l_strip) > 5):
                    # check if the previous line was a list item and this is short/lowercase etc.
                    # "monitoring of study interactions and history."
                    if l_strip[0].islower() and l_strip.endswith('.'):
                        new_lines.append(f"\\item {line}")
                        new_lines.append("\\end{itemize}\n")
                        in_list = False
                    else:
                        new_lines.append("\\end{itemize}\n")
                        in_list = False
                        new_lines.append(line)
                else:
                    if in_list:
                        new_lines.append("\\end{itemize}\n")
                        in_list = False
                    new_lines.append(line)
                    
            if in_list:
                new_lines.append("\\end{itemize}\n")
            
            with open(path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)

print("Formatted!")
