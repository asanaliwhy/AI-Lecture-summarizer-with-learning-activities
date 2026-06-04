import os
path = r'C:\Users\NURMA\Downloads\AITU_Diploma_2025-2026\AITU_Diploma_2025-2026\chapters\chapter01\main.tex'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Fix the runaway heading
text = text.replace('\\section{Structure of the}\nThesis This thesis', '\\section{Structure of the Thesis}\nThis thesis')

# Fix the broken list
bad_list = """\\begin{itemize}
\\item ingestion of YouTube URLs and uploaded documents;
\\end{itemize}

\\begin{itemize}
\\item transcript and text extraction;
\\end{itemize}

\\begin{itemize}
\\item AI-generated summaries, quizzes, flashcards, and chat responses;
\\end{itemize}

\\begin{itemize}
\\item user account management and OAuth support;
\\end{itemize}

\\begin{itemize}
\\item dashboards and libraries for saved materials;
\\end{itemize}

\\begin{itemize}
\\item export of generated content into PDF;
\\end{itemize}

monitoring of study interactions and history."""

good_list = """\\begin{itemize}
\\item ingestion of YouTube URLs and uploaded documents;
\\item transcript and text extraction;
\\item AI-generated summaries, quizzes, flashcards, and chat responses;
\\item user account management and OAuth support;
\\item dashboards and libraries for saved materials;
\\item export of generated content into PDF;
\\item monitoring of study interactions and history.
\\end{itemize}"""

text = text.replace(bad_list, good_list)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("Surgical fix applied!")
