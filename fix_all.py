import os
import re

chapters_dir = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\chapters'

# 1. Formatting Chapter 4 lists
def format_ch4_lists(text):
    # Split text into paragraphs
    paragraphs = text.split('\n\n')
    new_paragraphs = []
    
    in_list = False
    
    for i, p in enumerate(paragraphs):
        p_strip = p.strip()
        if not p_strip:
            continue
            
        # If paragraph ends with a colon, start a list next
        if p_strip.endswith(':'):
            if in_list:
                new_paragraphs.append('\\end{itemize}')
                in_list = False
            new_paragraphs.append(p)
            new_paragraphs.append('\\begin{itemize}')
            in_list = True
            
        elif in_list:
            # Check if this paragraph is part of the list
            # usually single sentences without \section
            if p_strip.startswith('\\section') or p_strip.startswith('\\chapter'):
                new_paragraphs.append('\\end{itemize}')
                in_list = False
                new_paragraphs.append(p)
            else:
                # Add item
                # Detect if the list ended (e.g., standard paragraph describing the end)
                # In CH4, "This structured text improves AI summarization compared to raw transcripts."
                # "This schema builds a personal knowledge base for each student..."
                if p_strip.startswith("This ") and "This schema" in p_strip or "This structured" in p_strip or "This approach" in p_strip:
                    new_paragraphs.append('\\end{itemize}')
                    in_list = False
                    new_paragraphs.append(p)
                else:
                    new_paragraphs.append(f'\\item {p_strip}')
        else:
            new_paragraphs.append(p)
            
    if in_list:
        new_paragraphs.append('\\end{itemize}')
        
    return '\n\n'.join(new_paragraphs)

# 2. Fix captions and tabular columns
def fix_captions_and_tables(text):
    # Remove "Table X - " and "Figure X - "
    text = re.sub(r'\\caption\{Table \d+\s*[—\-]\s*(.*?)\}', r'\\caption{\1}', text)
    text = re.sub(r'\\caption\{Figure \d+\s*[—\-]\s*(.*?)\}', r'\\caption{\1}', text)
    
    # Fix tabular columns: \begin{tabular}{|c|c|c|}
    def replace_tabular(match):
        cols_str = match.group(1) # e.g. "|c|c|c|c|" or "|c|c|"
        c_count = cols_str.count('c')
        if c_count > 1:
            width = 0.9 / c_count
            new_cols = "|" + "|".join([f"p{{{width:.2f}\\textwidth}}" for _ in range(c_count)]) + "|"
            return f"\\begin{{tabular}}{{{new_cols}}}"
        return match.group(0)

    # Note: earlier script used \\begin{tabular}{|c|c|c|...}
    # Let's match \begin{tabular}{|c|c...|}
    text = re.sub(r'\\begin\{tabular\}\{(\|[c\|]+)\}', replace_tabular, text)
    
    return text

for root, dirs, files in os.walk(chapters_dir):
    for file in files:
        if file.endswith('.tex'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            if "chapter04" in root:
                content = format_ch4_lists(content)
                
            content = fix_captions_and_tables(content)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)

print("Formatting applied!")
