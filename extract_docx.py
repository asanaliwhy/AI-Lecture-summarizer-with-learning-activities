import zipfile
import xml.etree.ElementTree as ET
import sys

def extract_docx(file_path):
    try:
        doc = zipfile.ZipFile(file_path)
        xml_content = doc.read('word/document2.xml')
        tree = ET.XML(xml_content)
        
        paragraphs = []
        for paragraph in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            texts = [node.text for node in paragraph.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
            if texts:
                paragraphs.append(''.join(texts))
            else:
                # Add an empty line for an empty paragraph
                paragraphs.append('')
                
        with open('extracted_diploma.txt', 'w', encoding='utf-8') as f:
            f.write('\n'.join(paragraphs))
            
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        extract_docx(sys.argv[1])
    else:
        print("Provide docx path")
