# Lectura — AI-Powered Study Assistant

**Bachelor Diploma Thesis**  
**Author:** [Student Name]  
**Year:** 2026

---

# Abstract

Lectura is an AI-powered study assistant designed to transform long-form educational content into structured and interactive learning materials. The system addresses a recurring challenge in modern higher education: students are frequently required to process large volumes of lecture videos, presentation recordings, academic texts, and supporting documentation, yet they often lack sufficient time and efficient tools for extracting the most important concepts, retaining information, and preparing for assessment. The project proposes a web-based platform that accepts YouTube lecture videos, uploaded documents, plain text, and audio-derived textual content, and converts them into organized study outputs such as summaries, quizzes, flashcards, and conversational tutoring sessions.

The application is implemented as a full-stack web system using React 18, TypeScript, Tailwind CSS, and React Query on the frontend, and Go, PostgreSQL, Redis, and WebSockets on the backend. Artificial intelligence functionality is powered by Google Gemini 3 Flash preview, which is used for summary generation, question generation, flashcard creation, and context-aware educational dialogue. The platform also incorporates JWT-based authentication, refresh token rotation, Google OAuth, PDF export, dashboard analytics, a library of saved learning materials, and study session tracking.

This thesis presents the background, design rationale, methodological approach, and architectural decisions behind Lectura. It examines relevant literature in artificial intelligence for education, summarization, quiz generation, conversational tutoring, and spaced repetition. It also compares existing systems and justifies the need for a specialized solution that unifies multimodal input processing and structured learning support in a single platform. The document further describes data collection and preprocessing, API and security methodology, core UML and architecture models, technology selection, and interface mockups. The resulting project demonstrates how modern AI systems can be combined with robust web engineering practices to support more accessible, efficient, and personalized study workflows.

**Keywords:** artificial intelligence in education, educational technology, summarization, flashcards, spaced repetition, quiz generation, conversational AI, web application, YouTube transcript processing

---

# Table of Contents

1. [Introduction](#1-introduction)
   1.1. [Background and Motivation](#11-background-and-motivation)  
   1.2. [Problem Statement](#12-problem-statement)  
   1.3. [Objectives of the Project](#13-objectives-of-the-project)  
   1.4. [Scope and Limitations](#14-scope-and-limitations)  
   1.5. [Structure of the Thesis](#15-structure-of-the-thesis)
2. [Literature Review](#2-literature-review)
   2.1. [Artificial Intelligence in Education](#21-artificial-intelligence-in-education)  
   2.2. [Automatic Summarization Techniques](#22-automatic-summarization-techniques)  
   2.3. [Spaced Repetition and Flashcard-Based Learning](#23-spaced-repetition-and-flashcard-based-learning)  
   2.4. [Quiz Generation from Text](#24-quiz-generation-from-text)  
   2.5. [Conversational AI Tutors in Education](#25-conversational-ai-tutors-in-education)  
   2.6. [Summary of Literature Review](#26-summary-of-literature-review)
3. [Analysis of Existing Systems](#3-analysis-of-existing-systems)
   3.1. [Notion AI](#31-notion-ai)  
   3.2. [Quizlet](#32-quizlet)  
   3.3. [Anki](#33-anki)  
   3.4. [ChatGPT](#34-chatgpt)  
   3.5. [Coursera](#35-coursera)  
   3.6. [Comparative Analysis](#36-comparative-analysis)  
   3.7. [Justification for Building Lectura](#37-justification-for-building-lectura)
4. [Data Collection](#4-data-collection)
   4.1. [Input Data Types](#41-input-data-types)  
   4.2. [YouTube Transcript Extraction](#42-youtube-transcript-extraction)  
   4.3. [PDF and Document Text Extraction](#43-pdf-and-document-text-extraction)  
   4.4. [Preprocessing Before AI Generation](#44-preprocessing-before-ai-generation)  
   4.5. [Storage of User Study Data](#45-storage-of-user-study-data)  
   4.6. [Data Privacy Considerations](#46-data-privacy-considerations)
5. [Methodology](#5-methodology)
   5.1. [System Design Approach](#51-system-design-approach)  
   5.2. [Agile Development Methodology](#52-agile-development-methodology)  
   5.3. [AI Prompt Engineering Methodology](#53-ai-prompt-engineering-methodology)  
   5.4. [API Design Methodology](#54-api-design-methodology)  
   5.5. [Testing Methodology](#55-testing-methodology)  
   5.6. [Security Methodology](#56-security-methodology)
6. [MVP, UML Diagrams, and Architecture](#6-mvp-uml-diagrams-and-architecture)
   6.1. [Minimum Viable Product Definition](#61-minimum-viable-product-definition)  
   6.2. [System Architecture Diagram Description](#62-system-architecture-diagram-description)  
   6.3. [Use Case Diagram Description](#63-use-case-diagram-description)  
   6.4. [Sequence Diagram for Content Generation](#64-sequence-diagram-for-content-generation)  
   6.5. [Sequence Diagram for Authentication](#65-sequence-diagram-for-authentication)  
   6.6. [Entity Relationship Diagram Description](#66-entity-relationship-diagram-description)  
   6.7. [Component Diagram Description](#67-component-diagram-description)  
   6.8. [Worker Pool Architecture](#68-worker-pool-architecture)
7. [Technology Comparison](#7-technology-comparison)
   7.1. [Frontend Framework Comparison](#71-frontend-framework-comparison-react-vs-vue-vs-angular)  
   7.2. [Backend Language Comparison](#72-backend-language-comparison-go-vs-nodejs-vs-python)  
   7.3. [Database Comparison](#73-database-comparison-postgresql-vs-mongodb-vs-mysql)  
   7.4. [AI Model Provider Comparison](#74-ai-model-provider-comparison-gemini-vs-openai-gpt-vs-claude)  
   7.5. [Caching Technology Comparison](#75-caching-technology-comparison-redis-vs-memcached-vs-in-memory)  
   7.6. [Deployment Platform Comparison](#76-deployment-platform-comparison-railway-vs-heroku-vs-render-vs-aws)
8. [Mockups of the Project](#8-mockups-of-the-project)
   8.1. [Design System Overview](#81-design-system-overview)  
   8.2. [Landing Page](#82-landing-page)  
   8.3. [Registration Page](#83-registration-page)  
   8.4. [Login Page](#84-login-page)  
   8.5. [Content Upload Page](#85-content-upload-page)  
   8.6. [Processing Page](#86-processing-page)  
   8.7. [Summary Page with Four Format Tabs](#87-summary-page-with-four-format-tabs)  
   8.8. [Quiz Configuration Page](#88-quiz-configuration-page)  
   8.9. [Quiz Taking Page](#89-quiz-taking-page)  
   8.10. [Quiz Results Page](#810-quiz-results-page)  
   8.11. [Flashcard Study Page](#811-flashcard-study-page)  
   8.12. [Flashcard Results Page](#812-flashcard-results-page)  
   8.13. [Dashboard Page](#813-dashboard-page)  
   8.14. [Library Page](#814-library-page)  
   8.15. [Settings Page](#815-settings-page)
9. [References](#9-references)

---

# 1. Introduction

## 1.1. Background and Motivation

The rapid growth of digital education has significantly changed the way students access and consume knowledge. University learners increasingly rely on recorded lectures, online tutorials, digital course packs, scanned readings, and educational platforms that provide content in asynchronous formats. This shift has many advantages, including flexibility, broader access to expertise, and the ability to revisit complex topics. However, it also introduces a major practical challenge: students are now expected to process a much larger quantity of information without always receiving additional support for organizing and retaining it.

In traditional classroom settings, students often complement live lectures with handwritten notes, interaction with instructors, and peer discussion. In contrast, online and hybrid learning environments frequently require the learner to independently extract key ideas from videos and documents that may last for hours or contain dense technical explanations. Many students respond to this challenge by watching content multiple times, manually pausing to take notes, or copying fragments of material into separate applications. These activities are time-consuming and cognitively demanding. As a result, the learning process can become inefficient, particularly when students are under pressure to prepare for examinations or complete assignments within limited time.

At the same time, recent progress in artificial intelligence, natural language processing, and large language models has created new possibilities for educational support systems. Modern AI services are capable of analyzing textual input, identifying central ideas, rewriting information in clearer formats, producing practice questions, generating memory aids, and supporting user interaction through conversational interfaces. These capabilities are especially relevant to education because they can reduce the burden of repetitive cognitive tasks and help learners focus on understanding and application rather than mere extraction of raw information.

The importance of AI-powered study tools lies not only in automation, but also in personalization and accessibility. Students have different learning preferences: some understand best through concise bullet summaries, others through paragraph explanations, question-answer structures, or spaced repetition. An intelligent study assistant can adapt content into multiple learning formats and thereby support a wider range of learning styles. In addition, such tools can benefit non-native speakers, students with attention difficulties, and users who require structured materials from otherwise unstructured educational content.

The project presented in this thesis, Lectura, emerges from this educational and technological context. It is designed as an integrated platform that converts YouTube lectures and uploaded documents into study-ready outputs such as summaries, quizzes, flashcards, and AI-assisted chat conversations. The motivation behind Lectura is the recognition that students do not merely need information access; they need mechanisms for transformation, organization, practice, and retention.

## 1.2. Problem Statement

The central problem addressed in this thesis is the difficulty students face when attempting to extract meaningful, structured, and memorable knowledge from long lecture videos and textual documents. This difficulty manifests in several related forms.

First, educational input sources are often long, noisy, and unstructured. A lecture video may include introductions, repetitions, examples, informal speech, and irrelevant discussion mixed with important conceptual content. Similarly, PDF documents may contain headers, footers, formatting artifacts, or pages with dense text that are difficult to review efficiently. Students must therefore spend considerable effort identifying what is essential.

Second, conventional note-taking and review methods are labor-intensive. Although note-taking itself can support learning, the manual creation of complete summaries, flashcards, and self-assessment questions requires substantial time. When students are managing multiple courses simultaneously, the repeated effort needed to transform content into active study materials becomes a barrier to consistent revision.

Third, many existing platforms address only one part of the learning workflow. Some tools are good for note organization, others for flashcards, others for conversational assistance, and others for course delivery. Few systems combine multimodal content ingestion, summary generation, self-testing, memorization support, progress tracking, and export functionality in a unified environment tailored to independent study.

Fourth, general-purpose AI chat systems can generate content on demand, but they often require users to manually paste source text, refine prompts, and verify structure and consistency. For students, this introduces prompt-engineering overhead and reduces reliability. There is a need for a system that embeds AI capability into a controlled and repeatable workflow.

The problem can therefore be summarized as follows: students lack an integrated tool that can automatically convert raw educational content into structured, reusable, and interactive learning materials while preserving usability, efficiency, and academic relevance.

## 1.3. Objectives of the Project

The main objective of Lectura is to design and implement an AI-powered web application that helps students transform educational content into structured study materials. This main objective can be divided into several specific goals:

1. To support multiple input modalities, including YouTube lecture videos, uploaded PDF documents, plain text, and text derived from audio-related sources.
2. To extract and preprocess textual content from these inputs in a reliable manner suitable for downstream AI processing.
3. To generate summaries in multiple pedagogically useful formats, namely Cornell notes, bullet summaries, paragraph summaries, and smart structured summaries.
4. To automatically generate quizzes containing multiple-choice questions from the processed source material.
5. To generate flashcard decks suitable for repeated study and integration with spaced repetition workflows.
6. To provide an AI chat assistant linked to generated summaries so that learners can ask follow-up questions grounded in the study material.
7. To track user study activity, including quiz attempts, flashcard sessions, and overall learning statistics.
8. To enable export of generated materials into PDF format for offline use and long-term archiving.
9. To build the application using modern, scalable web technologies that support maintainability, responsive design, and efficient deployment.
10. To provide a secure user experience through authentication, session management, and privacy-aware data handling.

These objectives reflect both educational and engineering priorities. From an educational standpoint, the project seeks to improve learning efficiency, comprehension, and retention. From a software engineering standpoint, it aims to deliver a robust full-stack system capable of integrating AI services into a coherent user workflow.

## 1.4. Scope and Limitations

The scope of the Lectura project includes the design and implementation of a production-style web application with integrated AI services. The project covers frontend and backend development, database design, worker-based asynchronous job processing, real-time job status notifications, user authentication, content generation workflows, analytics, and document export.

Within this scope, the system focuses primarily on post-processing of already available educational material. In other words, Lectura does not replace content creation, teaching, or formal assessment by instructors. Instead, it acts as a support tool that helps students convert source material into more usable study resources.

The project includes the following functional scope:

- ingestion of YouTube URLs and uploaded documents;
- transcript and text extraction;
- AI-generated summaries, quizzes, flashcards, and chat responses;
- user account management and OAuth support;
- dashboards and libraries for saved materials;
- export of generated content into PDF;
- monitoring of study interactions and history.

Despite its broad functionality, the project has several limitations.

First, AI-generated output is probabilistic rather than deterministic. Although prompts and validation logic can improve consistency, summaries and questions may still vary in quality or occasionally contain inaccuracies. Human review remains necessary, especially for high-stakes study contexts.

Second, the quality of output depends heavily on input quality. Poorly transcribed videos, scanned PDFs with extraction errors, incomplete captions, or ambiguous source material may reduce the accuracy of generated content.

Third, the system is oriented toward English-language academic content and may not perform equally well for all domains, languages, or document structures.

Fourth, the current implementation is a web application, which means that offline-native operation and deep device-level integrations available in desktop or mobile applications are outside the present scope.

Fifth, while study tracking and analytics are included, Lectura is not intended to be a full learning management system. It does not provide teacher dashboards, course administration, grading pipelines, or institutional reporting.

These limitations are appropriate for a bachelor-level project because they define a realistic and manageable implementation boundary while preserving substantial technical and academic complexity.

## 1.5. Structure of the Thesis

This thesis is organized into eight main chapters in addition to the abstract and references.

Chapter 1 introduces the educational context, motivation, problem statement, project objectives, and scope. It establishes the need for a system such as Lectura.

Chapter 2 reviews relevant academic literature on artificial intelligence in education, summarization, spaced repetition, quiz generation, and conversational tutoring systems. This chapter provides the theoretical foundation for the project.

Chapter 3 analyzes existing systems including Notion AI, Quizlet, Anki, ChatGPT, and Coursera. The purpose of this chapter is to identify current strengths and gaps in available solutions and to position Lectura within the broader EdTech landscape.

Chapter 4 describes the types of data processed by the system, the extraction methods used for YouTube and document inputs, preprocessing steps, storage of user study data, and privacy considerations.

Chapter 5 explains the methodology used in the project, including system design decisions, agile development, prompt engineering, API design, testing practices, and security strategy.

Chapter 6 presents the minimum viable product definition, architecture, and UML-style diagram descriptions. It explains how the system is organized across frontend, backend, database, AI, and worker infrastructure.

Chapter 7 compares the selected technologies with relevant alternatives and justifies the final technical stack.

Chapter 8 describes the project mockups and interface design, outlining the purpose and interaction logic of the key screens.

Finally, the reference section lists the academic and technical sources that inform the thesis.

---

# 2. Literature Review

## 2.1. Artificial Intelligence in Education

Artificial intelligence in education has evolved from rule-based tutoring systems toward data-driven and language-based systems capable of adaptation, feedback generation, and personalized support. Early intelligent tutoring systems were designed to model expert knowledge and student understanding in constrained domains, often using symbolic reasoning and pre-authored pedagogical rules. These systems demonstrated that personalized guidance could improve learning outcomes, but they were difficult to scale because each subject domain required significant manual modeling.

Recent advances in machine learning and natural language processing have significantly expanded the practical applicability of AI in educational environments. Holmes, Bialik, and Fadel argued that AI can support education through personalization, teacher augmentation, and learning analytics, provided that ethical and pedagogical constraints are considered carefully [1]. Similarly, Luckin and Cukurova emphasized that AI should be understood not as a replacement for teachers but as a tool that can enhance human decision-making and learner support [2].

One of the most important developments in this field is the rise of large language models, which are capable of generating coherent text, transforming input into structured representations, answering questions, and simulating tutoring dialogue. These capabilities make LLMs particularly attractive for study support applications because they can operate across subjects and input formats with minimal task-specific engineering. Nevertheless, researchers continue to highlight issues such as hallucination, bias, inconsistency, and pedagogical alignment. Therefore, AI in education remains a socio-technical design problem rather than a purely computational one.

Educational applications of AI can be grouped into several broad categories: automated feedback, adaptive learning, content recommendation, administrative support, conversational tutoring, and assessment assistance. Lectura is positioned primarily at the intersection of content transformation and study support. Rather than delivering formal instruction itself, it helps learners interact with material more effectively by converting raw educational input into cognitively manageable study artifacts.

The literature also indicates that effective educational technology must align with learning science rather than relying solely on technical novelty. Systems that simply produce content without regard to retention, retrieval practice, or cognitive load may offer limited educational benefit. Consequently, the design of Lectura draws not only from software capabilities but also from pedagogical concepts such as summarization for comprehension, quizzing for retrieval practice, and flashcards for spaced rehearsal.

## 2.2. Automatic Summarization Techniques

Automatic summarization is a long-standing research area within natural language processing. The goal of summarization is to reduce the length of source material while preserving its central meaning. Two major approaches dominate the literature: extractive summarization and abstractive summarization.

Extractive summarization selects existing sentences or phrases from a source document and arranges them into a shorter form. Classical methods relied on heuristics such as sentence position, term frequency, cue phrases, and graph-based salience. TextRank, for example, ranks sentences using graph centrality and remains a notable unsupervised approach [3]. Extractive methods are often easier to control and less likely to invent unsupported content, but they may produce summaries that feel fragmented or poorly organized.

Abstractive summarization, by contrast, generates new phrasing that captures the meaning of the original material. This approach is more aligned with how humans typically write summaries, but it is also more challenging because it requires semantic interpretation, compression, and paraphrasing. With the advent of transformer-based architectures, abstractive summarization has become significantly more practical. Research by See, Liu, and Manning demonstrated how neural sequence-to-sequence models with copy mechanisms could improve factual grounding while retaining generative flexibility [4]. Later transformer models further improved coherence and fluency, making abstractive summarization suitable for real-world applications.

Educational use cases introduce additional requirements beyond generic summarization. A study summary is not merely a short text; it may need to emphasize definitions, procedures, examples, key contrasts, and exam-relevant facts. It may also benefit from multiple formats depending on learner needs. For instance, Cornell notes support structured review and self-testing, bullet summaries emphasize clarity and scanability, paragraph summaries support narrative comprehension, and “smart” summaries can combine headings, concepts, and action points.

The literature suggests that summary usefulness is strongly context-dependent. Mani highlighted that summary quality depends not only on information coverage but also on user purpose [5]. In an educational setting, purpose may include revision before an exam, preview before class, or comprehension of unfamiliar material. This insight supports the design decision in Lectura to provide several summary modes rather than a single universal format.

At the same time, the use of LLM-based abstractive summarization creates risks. Generated summaries may overgeneralize, omit critical details, or introduce inaccuracies. This is especially relevant in technical disciplines where precision matters. Therefore, practical systems often combine prompt constraints, structural templates, chunk-level processing, and post-generation validation. The methodological implications of this research directly inform the prompt engineering and preprocessing strategy used in Lectura.

## 2.3. Spaced Repetition and Flashcard-Based Learning

Flashcards are one of the most established tools for active recall in educational psychology. Their effectiveness is rooted in the principle of retrieval practice: learning improves when the learner must actively recall information rather than passively re-read it. When flashcards are combined with spaced repetition, the effect can be amplified because review intervals are adjusted to exploit long-term memory dynamics.

The theoretical foundation of spaced repetition is often linked to Ebbinghaus and the forgetting curve, which describes the decline of memory retention over time in the absence of reinforcement [6]. Although the original experiments were limited, the underlying insight has shaped a vast body of memory research. Modern implementations of spaced repetition seek to schedule reviews just before forgetting would occur, thereby strengthening memory while reducing unnecessary repetition.

Cepeda et al. conducted influential work on distributed practice, showing that spacing learning events over time improves long-term retention across a wide range of tasks and contexts [7]. Roediger and Karpicke similarly demonstrated that retrieval practice enhances durable learning more effectively than repeated study alone [8]. These findings provide strong justification for integrating flashcard practice into educational systems.

Digital flashcard applications such as Anki have popularized algorithmic review scheduling, user rating systems, and large community-generated decks. However, manually authoring flashcards remains a significant obstacle for many learners. AI-assisted generation can reduce this friction by automatically identifying concepts, definitions, and question-answer pairs from educational input. If designed well, this can help users move more quickly from content exposure to active memorization.

Nevertheless, there are pedagogical considerations. Automatically generated flashcards should avoid triviality, ambiguity, and excessive wordiness. The best flashcards usually contain one idea per card, clear phrasing, and an answer that can be recalled efficiently. This implies that AI generation must be guided toward atomic, testable knowledge units. In Lectura, flashcard generation is therefore treated not as a generic summarization task but as a targeted transformation into memory-friendly prompts and answers.

## 2.4. Quiz Generation from Text

Automated quiz generation has received increasing attention as NLP and machine learning systems have improved. The educational appeal of quiz generation lies in its ability to support formative assessment and retrieval practice. Instead of relying exclusively on reading or note review, students can test their understanding with questions derived from the learning material itself.

Early approaches to question generation often used templates, syntactic parsing, and answer selection pipelines. More recent systems employ neural models and transformer architectures to generate natural-language questions directly from source passages. Kurdi, Leo, and Parsia reviewed developments in automatic question generation and noted that the field has progressed from rule-based methods to deep learning approaches that better capture semantic context [9].

Multiple-choice question generation is particularly relevant for undergraduate study because it mirrors a common assessment format and enables objective scoring. However, generating good multiple-choice questions is more complex than producing a single prompt. A useful MCQ requires a clear stem, one unambiguously correct answer, and distractors that are plausible but incorrect. Poorly designed distractors may make questions too easy or misleading, reducing educational value.

Large language models offer a flexible mechanism for generating quizzes, especially when source text is already available. They can create questions across many subject areas without domain-specific templates. However, they also present risks such as factual error, inconsistency in difficulty, or repetitive question structures. Therefore, production-oriented systems often supplement generation with schema enforcement, post-processing, and lightweight validation.

Research on testing effects supports the inclusion of quizzes as a central learning feature. Frequent low-stakes testing can improve recall, metacognitive awareness, and long-term retention. In the context of Lectura, automated quiz generation is not primarily intended for formal grading; instead, it functions as a self-assessment mechanism that helps students identify weak areas and reinforce understanding.

## 2.5. Conversational AI Tutors in Education

Conversational AI systems have become increasingly relevant in education because they allow students to engage in dialogue, ask clarifying questions, and receive immediate responses. Traditional tutoring is highly effective but resource-intensive; conversational agents offer a scalable supplement, though not a direct substitute.

Winkler and Söllner surveyed chatbot applications in education and found that such systems can support motivation, information access, and self-paced learning, especially when designed around clear pedagogical roles [10]. Recent LLM-based tutors extend this capability by generating contextual explanations, examples, and follow-up prompts. They can emulate some aspects of Socratic dialogue, guide students through reasoning steps, and answer questions in natural language.

However, conversational AI in education raises both pedagogical and ethical concerns. Students may overtrust confident but incorrect answers, rely excessively on the system instead of developing independent reasoning, or receive explanations that are not aligned with curricular goals. Researchers such as Kasneci et al. have emphasized that LLMs can be powerful educational assistants, but only when used with awareness of reliability limits and the need for critical verification [11].

A major design question concerns grounding. Generic chatbots answer from broad prior knowledge and may not remain anchored to the user’s actual study material. For a study assistant, grounded conversation is preferable because it allows the chatbot to reference the generated summary or extracted content, improving relevance and reducing drift. Lectura addresses this issue by linking chat interactions to specific summaries so that the conversation remains embedded in a defined learning context.

Conversational support is particularly valuable after summarization. Once a summary is generated, students may still need clarification about terminology, deeper examples, comparisons between concepts, or short explanations of difficult passages. In such cases, a chat interface can act as an interactive layer on top of static generated material.

## 2.6. Summary of Literature Review

The reviewed literature establishes a strong theoretical basis for the Lectura project. Research in AI in education shows that intelligent systems can support personalization, feedback, and learner autonomy when integrated carefully into educational workflows. Summarization studies demonstrate the trade-offs between extractive reliability and abstractive flexibility, supporting the use of structured AI prompting for study-oriented outputs. Memory research on spaced repetition and retrieval practice provides clear justification for flashcard and quiz functionality. Work on automated question generation confirms the feasibility and educational relevance of NLP-based self-testing. Finally, studies of conversational tutoring indicate the value of grounded dialogue while also highlighting the importance of managing reliability and trust.

Taken together, these findings suggest that an integrated platform combining summarization, quiz generation, flashcards, and conversational assistance can address a meaningful educational need. The literature does not imply that AI alone solves learning problems, but it strongly supports the idea that well-designed AI tools can reduce friction in study preparation and enhance active engagement with content.

---

# 3. Analysis of Existing Systems

## 3.1. Notion AI

Notion AI is an extension of the Notion productivity and note-taking environment. It provides users with AI-assisted writing, rewriting, summarization, brainstorming, and content transformation capabilities within a document-centric workspace. Students frequently use Notion for organizing course notes, task lists, and study plans, making Notion AI a relevant point of comparison.

The main strength of Notion AI lies in its integration with a flexible note ecosystem. It can summarize existing notes, improve writing, produce short outlines, and help users organize information in a familiar interface. Its general usability and broad adoption also make it accessible to many learners.

However, Notion AI is not specifically designed as a study pipeline for transforming raw educational inputs such as lecture videos and uploaded documents into structured study artifacts. It does not natively focus on transcript extraction, automated quiz creation, flashcard study workflows, or grounded chat linked to summary objects. Its AI support is broad but not optimized for educational task automation.

Lectura differs by treating content ingestion and study transformation as first-class features. Instead of requiring the user to manually bring content into a workspace and then prompt for outputs, Lectura provides a guided pipeline from source input to summary, quiz, flashcards, chat, analytics, and export.

## 3.2. Quizlet

Quizlet is one of the best-known digital study platforms, centered mainly on flashcards, practice modes, and vocabulary-style learning. It allows users to create study sets manually and review them through several interactive formats. More recently, it has incorporated AI-assisted features and test modes.

Quizlet’s main strength is its focus on memorization and quick study interactions. Its interface is straightforward, and it is particularly effective for short fact-based content such as terms, definitions, language learning, and formula recall. It also benefits from network effects through shared study sets and high brand familiarity among students.

Its weakness, however, is that it does not primarily address long-form educational source material such as lecture videos or PDFs. While content can sometimes be imported or generated, the platform is not built around a multimodal academic workflow that begins with raw educational input. In addition, summary generation and grounded AI chat are limited compared with a specialized AI-first study system.

Lectura extends beyond memorization support by automating the full transformation of educational content into several learning formats. Where Quizlet excels at reviewing flashcards, Lectura aims to cover the complete pipeline from understanding to practice to retention.

## 3.3. Anki

Anki is a widely respected open-source flashcard system based on spaced repetition. It is especially popular among medical students, language learners, and users who value long-term retention. Anki’s main advantage is pedagogical depth: its scheduling mechanisms, customization options, add-on ecosystem, and community decks make it powerful for serious memorization tasks.

The strengths of Anki include advanced spaced repetition, offline capability, strong customizability, and proven effectiveness in recall-based study. For users willing to invest time, Anki can become a highly efficient long-term study tool.

However, Anki also has notable weaknesses from the perspective of content transformation. It assumes that users already have flashcards or are willing to create them. The interface can feel dated to new users, and its workflow is oriented toward deck management rather than integrated AI-assisted content generation. It does not inherently provide automatic summary creation, AI chat tutoring, transcript processing, or dashboard-style analytics around multimodal educational inputs.

Lectura differentiates itself by lowering the barrier to entry. Instead of asking the learner to manually formulate cards, it generates flashcards from source material and situates them alongside summaries, quizzes, and chat interactions. Although Lectura’s flashcard system may be less customizable than Anki’s mature ecosystem, it offers a more unified and automated academic workflow.

## 3.4. ChatGPT

ChatGPT is a general-purpose conversational AI system capable of summarization, explanation, brainstorming, coding assistance, and many other text-based tasks. It is arguably one of the most frequently used AI tools by students due to its flexibility and ease of access.

Its strongest advantage is versatility. Students can ask it to summarize lecture notes, explain difficult concepts, generate practice questions, and simulate tutoring dialogue. It can work across disciplines and adapt to highly varied prompts.

Nevertheless, ChatGPT is not inherently a structured study management platform. Users must manually paste content or describe it, craft prompts, manage outputs, and organize generated artifacts outside the system. There is no built-in pipeline for transcript extraction, content libraries, persistent study objects, study analytics, flashcard sessions, or PDF export tailored to generated academic outputs.

The key difference with Lectura is product design. Lectura uses AI inside a dedicated educational workflow. Instead of requiring users to orchestrate the process themselves, it provides system-defined objects such as summaries, quizzes, flashcards, jobs, sessions, and dashboard metrics. In other words, ChatGPT offers broad AI capability, while Lectura offers workflow specialization.

## 3.5. Coursera

Coursera is a large-scale online learning platform that provides structured courses, recorded lectures, assignments, certificates, and institutional partnerships. It differs from the previous tools because its core value lies in course delivery rather than personal study content transformation.

Coursera’s strengths include curated content, structured learning pathways, instructor-created material, and recognized academic and professional partnerships. It is effective when the learner wishes to take a complete course rather than process independently collected material.

Its weakness for the problem addressed in this thesis is that it is not designed to ingest arbitrary user-provided educational content and transform it into personalized study materials. Learners cannot generally upload a PDF or paste a YouTube lecture and receive automated summaries, quizzes, flashcards, and AI-grounded chat centered on that content.

Lectura therefore serves a different use case. Whereas Coursera organizes institution-provided courses, Lectura helps students work with the content they already have, whether from a university lecture recording, a seminar video, a document provided by a teacher, or self-collected study material.

## 3.6. Comparative Analysis

The competitor analysis reveals that each existing system provides valuable functionality, yet each addresses only part of the problem space.

- Notion AI supports note-related AI assistance but not a specialized study workflow.
- Quizlet supports memorization and practice but is limited in multimodal input transformation.
- Anki provides powerful spaced repetition but requires manual content preparation and offers limited integrated AI generation.
- ChatGPT provides flexible generation and explanation but lacks structured study management.
- Coursera delivers curated educational content but not user-driven input transformation.

Lectura attempts to unify the strongest aspects of these ecosystems in a single product: automatic transformation of external study material, structured educational outputs, active recall features, conversational explanation, persistence, analytics, and export.

**Table 1. Comparison of Existing Systems and Lectura**

| System | Summary Generation | Quiz Generation | Flashcards | AI Chat | Video Input | PDF Export | Free Tier |
|---|---|---|---|---|---|---|---|
| Notion AI | Yes | Limited | No native study workflow | Limited | No direct academic ingestion pipeline | Limited | Partial |
| Quizlet | Limited | Yes | Yes | Limited | No | Limited | Yes |
| Anki | No native AI summary | No native AI quiz workflow | Yes | No | No | No native export focus | Yes |
| ChatGPT | Yes | Yes | Possible via prompts | Yes | Indirect/manual | Limited/manual | Partial |
| Coursera | Course notes only | Course-specific | Limited | Limited in platform context | Yes, platform-owned videos | Limited | Partial |
| Lectura | Yes, 4 formats | Yes | Yes | Yes, summary-grounded | Yes | Yes | Planned limited tier |

## 3.7. Justification for Building Lectura

The comparative analysis justifies the development of Lectura on both functional and educational grounds. Existing systems either provide fragmented capabilities or operate in domains adjacent to the target use case. None of the analyzed platforms combine the following in a single, student-centered workflow: ingestion of lecture videos and uploaded documents, AI-based multi-format summarization, automatic quiz generation, flashcard generation, grounded conversational support, study tracking, and export.

This gap is significant because student learning often depends on moving efficiently between several phases: understanding source material, condensing it into reviewable form, testing comprehension, reinforcing memory, and revisiting concepts through questions. When these steps are scattered across multiple applications, friction increases and consistency decreases. Lectura is justified as a unifying platform that reduces this friction and aligns modern AI capability with concrete educational tasks.

---

# 4. Data Collection

## 4.1. Input Data Types

Lectura processes several categories of input data in order to support real-world student workflows.

The first category is **YouTube video transcripts**. Educational lectures, conference presentations, recorded classes, and tutorial videos often exist on YouTube and form a major source of learning content for students. These videos provide rich informational content but are difficult to review efficiently in raw form.

The second category is **uploaded PDF files**. These may include lecture slides, academic articles, handouts, reading materials, lab instructions, and reports. PDF remains one of the most common document formats in higher education.

The third category is **plain text input**. This allows users to paste notes, excerpts, copied transcripts, or short textual materials directly into the system without uploading a file.

The fourth category is **audio-related textual input**, meaning content originating from audio files after transcription or other speech-to-text preprocessing. Although the core application is centered on text ingestion for downstream AI processing, the broader study workflow may include speech-derived text as an input source.

Together, these data types ensure that the system remains flexible enough to support both formal course materials and learner-collected content.

## 4.2. YouTube Transcript Extraction

YouTube transcript extraction is a critical function because many students rely on recorded lectures. The extraction process begins when the user submits a YouTube URL. The backend validates the URL format, extracts the video identifier, and attempts to retrieve the transcript through available transcript APIs or caption endpoints.

The preferred path is direct transcript retrieval through a transcript API that accesses caption data when subtitles are available. This method is efficient because it preserves timing structure and usually provides cleaner text than speech recognition from raw audio.

However, transcript availability is not guaranteed. Captions may be missing, disabled, incomplete, or region-dependent. For this reason, fallback methods are necessary. These may include alternate caption retrieval routines, language fallback selection, or other extraction strategies available within the system’s service layer. In a robust pipeline, each fallback is designed to maximize retrieval success while preserving acceptable latency.

Once transcript text is obtained, timestamps may be preserved internally for traceability, but the summary-generation pipeline primarily requires normalized textual content. Therefore, captions are merged into coherent text blocks suitable for preprocessing and chunking.

This extraction step is essential because the educational usefulness of the system depends heavily on reliable acquisition of source content. A lecture processing tool that fails frequently at transcript retrieval would not meet practical student needs.

## 4.3. PDF and Document Text Extraction

PDF extraction introduces challenges distinct from transcript processing. Unlike plain text, PDF files are presentation-oriented documents whose internal structure may not map cleanly to logical reading order. Text can be split across coordinates, multi-column layouts, repeated headers and footers, or embedded fonts. In scanned documents, text may exist only as images, requiring OCR if advanced extraction is desired.

In Lectura, PDF extraction focuses on retrieving machine-readable text from uploaded files in a form suitable for AI analysis. The extraction service reads the document, obtains textual content from its pages, and concatenates the results into a unified textual representation. During this stage, obvious artifacts such as repeated page labels, broken line endings, or redundant whitespace are reduced.

If the input document contains sections, headings, or bullet structures, preserving this structure where possible improves downstream summary quality. For example, bullet points in lecture slides may indicate high-level concepts, while headings can help chunking logic maintain semantic boundaries.

Although PDF text extraction can be highly effective for standard digital documents, limitations remain for highly graphical or scanned inputs. Therefore, the system must be designed so that imperfect extraction still leads to usable output whenever possible, while acknowledging that input quality affects final AI results.

## 4.4. Preprocessing Before AI Generation

Preprocessing is one of the most important stages in the Lectura pipeline because large language model output quality is highly sensitive to input cleanliness and structure. Raw extracted text from videos and documents often contains noise, duplication, inconsistent spacing, timestamps, speaker artifacts, or formatting fragments that can confuse downstream generation.

The preprocessing pipeline includes several major steps:

1. **Cleaning.** Non-informative symbols, repeated whitespace, timestamp remnants, and duplicated fragments are removed or normalized.
2. **Segmentation.** Long documents are divided into manageable chunks. Chunking is necessary because model context windows are finite and because extremely long prompts can reduce reliability.
3. **Length normalization.** Input sections are adjusted so that chunks fall within acceptable token limits while still containing enough semantic continuity to preserve meaning.
4. **Boundary preservation.** Where possible, chunking respects paragraph or heading boundaries rather than cutting content arbitrarily in the middle of ideas.
5. **Metadata association.** The system retains references to the content source, summary format, user, and processing job so that outputs remain traceable.

After preprocessing, the cleaned chunks are sent to Gemini with task-specific prompts. Depending on the workflow, generation may occur in one stage or in multiple stages, such as chunk-level synthesis followed by final consolidation. This approach improves scalability and consistency for long educational materials.

## 4.5. Storage of User Study Data

Beyond source content, Lectura stores behavioral and generated data associated with user study activity. This supports personalization, progress review, and persistent access to previously generated materials.

The stored data includes:

- user profile data and authentication-related metadata;
- uploaded or linked content records;
- generated summaries and summary preferences;
- generated quizzes and individual questions;
- quiz attempts, scores, selected answers, and timestamps;
- generated flashcards and flashcard decks;
- flashcard study sessions and card ratings associated with recall difficulty;
- general study sessions used for dashboard analytics;
- summary-linked chat history for conversational review;
- asynchronous job records that track generation progress and failure states.

This data model makes it possible to provide dashboards showing activity frequency, performance indicators, study streaks, and library access patterns. It also allows the application to persist learning materials rather than treating AI outputs as disposable one-time responses.

## 4.6. Data Privacy Considerations

Data privacy is a core concern in any educational system that stores personal accounts, learning behavior, and user-provided content. Lectura therefore requires privacy-aware design at multiple levels.

First, only data necessary for application functionality should be collected. This principle of minimization reduces risk and simplifies compliance with data protection expectations.

Second, authentication tokens and user credentials must be handled securely, with password hashing, refresh token rotation, and secure transport practices. Sensitive values should not be exposed to the client beyond what is operationally required.

Third, user-generated content and study history should be logically isolated by user identity so that one user cannot access another user’s summaries, chats, quizzes, or uploaded documents.

Fourth, when AI services are used, the system should clearly define what text is transmitted to external providers and under what security assumptions. Since source material may include course notes or copyrighted educational texts, the system design should be transparent about external processing.

Fifth, retention policies should be considered. If users delete materials, corresponding stored records should be removable or marked for deletion according to application policy.

Privacy is particularly important in education because learning behavior can reveal personal interests, academic challenges, and performance patterns. Therefore, data handling is not merely a technical implementation detail; it is part of the ethical foundation of the platform.

---

# 5. Methodology

## 5.1. System Design Approach

Lectura was designed as a full-stack web application rather than a mobile-only or desktop-only system. This decision was based on accessibility, development efficiency, deployment simplicity, and usage patterns typical of higher education students.

A web application offers immediate cross-platform availability. Students can access the system from laptops, university computers, tablets, or phones through a browser without installing platform-specific software. Because study workflows often involve moving between devices, browser-based access is particularly valuable.

Compared with a native mobile application, a web architecture reduces the cost of maintaining separate codebases for iOS and Android while still enabling responsive design. Although mobile apps can offer superior offline integration and device-level notifications, the primary Lectura workflow involves reading documents, reviewing summaries, answering quizzes, and studying generated materials, all of which are well supported in the browser environment.

Compared with a desktop application, a web system offers easier centralized deployment, simpler updates, and smoother integration with cloud services such as AI providers, managed databases, and WebSocket communication. These advantages are especially important for a project that must support asynchronous generation jobs, secure authentication, and multi-user persistence.

The final design therefore adopts a three-tier architecture: frontend client, backend API and processing services, and persistence plus infrastructure services. This structure offers a balance between maintainability, scalability, and implementation clarity.

## 5.2. Agile Development Methodology

The project was developed using an agile, iterative methodology rather than a rigid linear process. This choice reflects the uncertainty inherent in building AI-powered systems, where output quality, prompt behavior, user experience, and system performance often require repeated refinement.

The agile process used in the project can be described through several recurring cycles:

1. **Requirement identification.** Core user needs were identified, such as uploading content, generating summaries, taking quizzes, and tracking progress.
2. **Feature slicing.** Large goals were broken into manageable increments, for example implementing summary generation before adding flashcards and chat.
3. **Implementation.** Each increment was built across frontend, backend, and data layers.
4. **Testing and QA.** Features were verified through unit tests, integration tests, and manual review.
5. **Refinement.** Based on defects or usability issues, prompts, APIs, UI states, and edge-case handling were improved.

This methodology was appropriate because the system contains interdependent layers. For example, a change in summary schema affects backend validation, database storage, frontend rendering, and export behavior. An iterative process allowed these concerns to be resolved progressively.

The project also incorporated manual QA across a broad set of interface sections and workflows. This is particularly important for educational applications, where usability directly affects the learner’s ability to benefit from the system.

## 5.3. AI Prompt Engineering Methodology

Prompt engineering in Lectura was not treated as ad hoc instruction writing, but as a structured engineering discipline. Because the project relies on AI generation for summaries, quizzes, flashcards, and chat responses, prompt design had to balance flexibility with output control.

A dedicated prompt strategy was designed for each content type.

For **summary generation**, prompts specify the target output format, such as Cornell notes, bullets, paragraph summary, or smart structured summary. The prompts instruct the model to preserve key concepts, avoid unnecessary invention, and write in a study-oriented style.

For **quiz generation**, prompts define the required number of multiple-choice questions, answer format, distractor quality expectations, and difficulty constraints. The goal is to produce questions that are both educationally useful and machine-parseable.

For **flashcard generation**, prompts emphasize concise question-answer pairs, one concept per card, and wording suitable for active recall.

For **chat**, prompts ground the model in previously generated summary content and instruct it to provide concise, helpful educational explanations while remaining aligned with the source context.

To enforce structure, the system uses schema-oriented or format-constrained output expectations wherever possible. This reduces parsing errors and improves frontend consistency. In practical terms, the model is guided to return outputs that can be validated against expected fields and object shapes.

Retry and fallback logic are also part of the methodology. If generation fails due to formatting issues, API instability, or validation mismatch, the system can attempt regeneration or fall back to alternative prompts or safer processing paths. This is especially important because AI outputs are not guaranteed to be stable across requests.

Thus, prompt engineering in Lectura is best understood as controlled generation design, combining linguistic instruction, schema expectations, error handling, and post-processing validation.

## 5.4. API Design Methodology

The backend API follows a RESTful design for the majority of application interactions. REST was chosen because it provides a familiar and maintainable pattern for resource-oriented operations such as authentication, content submission, retrieval of summaries, quiz attempts, flashcard sessions, and library browsing.

Each major domain of the application corresponds to a clear set of backend endpoints. Examples include authentication routes, content routes, summary routes, quiz routes, flashcard routes, dashboard routes, and chat-related routes. This separation improves maintainability and allows domain logic to remain modular.

However, REST alone is not sufficient for long-running AI generation tasks. Summary, quiz, and flashcard creation may take several seconds or longer, especially when content is long or external AI requests are delayed. To address this, Lectura uses WebSockets for real-time progress updates. The generation workflow creates a job record, and the frontend subscribes to progress notifications so that users can see status transitions without repeatedly polling the server.

This hybrid approach combines the clarity of REST for standard CRUD-style interactions with the responsiveness of WebSockets for asynchronous processing. It also improves user experience by making AI operations observable and reducing uncertainty during wait times.

## 5.5. Testing Methodology

Testing in the project was designed to cover both technical correctness and user-facing reliability. Because Lectura includes frontend interaction logic, backend business rules, asynchronous jobs, database access, and AI integration boundaries, a single testing style would be insufficient.

The testing strategy includes:

- **Unit tests**, which validate isolated functions, service logic, handlers, and utility behavior.
- **Integration tests**, which verify interactions between layers such as handlers, repositories, authentication, middleware, and routing.
- **Manual QA**, which verifies user workflows, visual rendering, state transitions, and edge cases that are difficult to express fully in automated form.

Manual quality assurance is especially important in the context of AI-assisted applications. Even if the code behaves correctly, poor prompt output formatting, broken loading states, unclear progress feedback, or awkward user interactions can reduce the overall quality of the product. Therefore, the project included inspection across a broad set of approximately 18 interface sections and flows, ensuring that navigation, generation, result rendering, and study activities behaved coherently.

Where feasible, tests are designed to cover both positive cases and error cases, including invalid input, unauthorized access, token handling issues, rate-limiting behavior, and external-service failures.

## 5.6. Security Methodology

Security methodology in Lectura focuses on protecting user identity, preventing common web vulnerabilities, and ensuring safe handling of content processing workflows.

Authentication is based on **JWT access tokens** combined with **refresh tokens**. This allows short-lived access credentials while maintaining user sessions more securely than long-lived tokens alone. Refresh token rotation further reduces risk by invalidating replaced tokens and limiting replay potential.

**CORS controls** are applied so that only approved origins can access the backend in a browser context. This helps prevent unauthorized cross-origin requests in deployment scenarios where frontend and backend may be hosted separately.

**SQL injection prevention** is achieved through safe database interaction patterns, such as parameterized queries or ORM/query-builder safeguards where applicable. Input is never concatenated directly into raw SQL strings in a dangerous manner.

**Input sanitization and validation** are applied to user-submitted values including URLs, text, query parameters, and settings fields. This reduces the risk of malformed requests, unsafe content handling, and stored or reflected injection vulnerabilities.

Additional security practices include password hashing, secure cookie handling where relevant, authorization checks on user-owned resources, and careful separation between public and protected routes.

Because Lectura interacts with external AI services and processes user-uploaded material, security must be understood broadly: not only in terms of authentication, but also in terms of content isolation, abuse prevention, rate limiting, and resilience against malformed or excessively large inputs.

---

# 6. MVP, UML Diagrams, and Architecture

## 6.1. Minimum Viable Product Definition

The minimum viable product of Lectura is defined as the smallest coherent version of the system that delivers the core educational value proposition. In this project, the MVP includes the following features:

- user registration and login;
- submission of a YouTube URL or text/document content;
- extraction and preprocessing of source text;
- AI generation of at least one structured summary format;
- persistence of generated content in the database;
- a frontend interface for viewing results;
- basic study interaction through quiz or flashcard generation;
- user library access to previously generated materials.

Additional features such as chat, dashboard statistics, OAuth, PDF export, and multi-format summaries expand the system beyond the strict MVP but are still included in the implemented project as value-adding functionality.

The MVP framing is important because it shows how the project could be staged. Even if advanced features were added iteratively, the system already provided educational utility once users could transform raw content into persistent study material.

## 6.2. System Architecture Diagram Description

The Lectura architecture follows a three-tier design.

**Tier 1: Frontend Layer**  
The frontend is implemented using React 18 with TypeScript and Tailwind CSS. It is responsible for user interaction, content submission, authentication UI, result presentation, quiz and flashcard interfaces, dashboard visualizations, and settings management. React Query is used for efficient server-state handling, caching, mutation control, and loading/error states.

**Tier 2: Backend Application Layer**  
The backend is implemented in Go and exposes REST endpoints for core application functionality. It also maintains WebSocket communication for real-time job progress. Within the backend, the architecture is organized into handlers, services, repositories, middleware, and worker pool components. Handlers process HTTP requests, services contain business logic, repositories interact with PostgreSQL, middleware enforces security and observability, and the worker pool manages asynchronous generation jobs.

**Tier 3: Data and External Services Layer**  
PostgreSQL stores persistent application data including users, content, summaries, quizzes, flashcards, jobs, sessions, and chat messages. Redis provides caching and fast-access support for ephemeral or high-frequency operations. External AI services, specifically Google Gemini 3 Flash preview, are used to generate summaries, quizzes, flashcards, and chat responses. Auxiliary transcript and extraction services support YouTube and document processing.

**Diagram Label Description:**
- Client Browser → Frontend UI
- Frontend UI → REST API / WebSocket Gateway
- Backend API → PostgreSQL
- Backend API → Redis
- Worker Pool → Gemini API
- Worker Pool → PostgreSQL for saving results
- WebSocket Hub → Frontend notifications

This architecture separates concerns clearly and supports scaling of user-facing interaction independently from long-running AI work.

## 6.3. Use Case Diagram Description

The use case diagram for Lectura includes three actors: **Guest**, **Authenticated User**, and **System**.

### Guest Actor Use Cases

- Register account
- Login
- View landing page
- Initiate Google OAuth

The guest actor is limited to public access paths and cannot generate or view private study materials.

### Authenticated User Use Cases

- Upload content or submit YouTube URL
- Generate summary
- Configure and take quiz
- Generate and study flashcards
- Chat with AI about a summary
- Export results to PDF
- View dashboard statistics
- Browse library of saved materials
- Manage settings and profile
- Logout

### System Actor Use Cases

- Validate input
- Extract transcript or document text
- Create generation job
- Call AI service
- Store result
- Notify frontend via WebSocket
- Track study session data
- Refresh authentication token

**Diagram Relationship Description:**
- “Generate Summary” includes “Upload Content” and “Create Job”.
- “Take Quiz” extends “Generate Quiz” when the quiz does not yet exist.
- “Study Flashcards” extends “Generate Flashcards” when a deck must be created first.
- “Chat with AI” depends on an existing summary context.
- “Export PDF” includes retrieval of stored output.

This use case model demonstrates that Lectura is not just a generation tool but a full study workflow platform.

## 6.4. Sequence Diagram for Content Generation

The content generation flow can be described as the following text-based sequence diagram.

**Actors/Objects:** User, Frontend, Backend API, Job Repository, Worker Pool, Gemini Service, Database, WebSocket Hub.

**Sequence:**
1. The **User** submits a YouTube URL or uploads a document from the **Frontend**.
2. The **Frontend** sends a request to the **Backend API**.
3. The **Backend API** validates the request, checks authentication, and creates a new content record.
4. The **Backend API** creates a generation job through the **Job Repository** and saves its initial status in the **Database**.
5. The **Backend API** returns a job identifier to the **Frontend**.
6. The **Frontend** subscribes to progress updates through the **WebSocket Hub**.
7. The **Worker Pool** polls or receives the pending job and begins processing.
8. The **Worker Pool** retrieves the associated source content from the **Database** or extraction service.
9. The **Worker Pool** preprocesses the content and sends a prompt request to the **Gemini Service**.
10. The **Gemini Service** returns structured generated output.
11. The **Worker Pool** validates and stores the result in the **Database**.
12. The **Worker Pool** updates the job status to completed.
13. The **WebSocket Hub** sends a completion event to the **Frontend**.
14. The **Frontend** updates the UI and shows the generated result to the **User**.

**Alternative/Error Paths:**
- If validation fails, the API returns an immediate error.
- If AI generation fails, the job status becomes failed and the frontend is notified accordingly.
- If parsing fails, retry logic may be triggered before the final failure state is stored.

## 6.5. Sequence Diagram for Authentication

The authentication flow is described as follows.

**Actors/Objects:** User, Frontend, Backend Auth Handler, Auth Service, Database, Token Store/Refresh Mechanism.

**Sequence:**
1. The **User** enters email and password on the **Frontend**.
2. The **Frontend** sends login credentials to the **Backend Auth Handler**.
3. The **Auth Handler** validates the input and passes the request to the **Auth Service**.
4. The **Auth Service** retrieves the user record from the **Database**.
5. The **Auth Service** verifies the password hash.
6. On success, the **Auth Service** issues a short-lived JWT access token and a refresh token.
7. The refresh token is stored or registered for rotation logic.
8. The **Backend** returns the tokens to the **Frontend** according to the session design.
9. The **Frontend** stores session state and allows access to protected routes.
10. When the access token expires, the **Frontend** sends the refresh token to the backend.
11. The **Backend** validates the refresh token, invalidates or rotates it, and issues a new access token and refresh token pair.
12. If refresh validation fails, the user is logged out and redirected to authentication.

This sequence demonstrates secure session continuity while limiting the lifetime of primary access credentials.

## 6.6. Entity Relationship Diagram Description

The core entities in Lectura are as follows.

### User
Stores account information such as email, password hash, profile metadata, OAuth linkage, preferences, and timestamps.

### Content
Represents a user-submitted source item. Attributes include content type, source URL if applicable, extracted text, title, thumbnail metadata, and ownership by user.

### Summary
Represents a generated summary linked to a content item and user. Includes format type, generated text, favorite state, quality indicators, and timestamps.

### Quiz
Represents a generated quiz linked to a content item or summary. Includes metadata such as title, number of questions, favorite state, and timestamps.

### QuizAttempt
Represents one user attempt on a quiz. Stores score, selected answers, correctness data, and attempt time.

### Flashcard
Represents an individual flashcard belonging to a generated deck linked to content or summary. Stores front, back, order, and optional difficulty metadata.

### FlashcardSession
Represents a study session over a flashcard deck, including ratings, performance data, and timestamps.

### StudySession
Represents generalized user activity for dashboard analytics, such as summary review, quiz completion, or flashcard study.

### ChatMessage
Represents a message within a summary-linked AI chat thread. Stores sender role, message content, summary association, and timestamp.

### Job
Represents an asynchronous generation task. Stores job type, status, progress metadata, error state, and links to content and user.

**Relationship Description:**
- One **User** has many **Content** items.
- One **Content** has many **Summary**, **Quiz**, and **Job** records.
- One **Quiz** has many **QuizAttempt** records.
- One **Content** or **Summary** can have many **Flashcard** records grouped by deck.
- One **User** has many **FlashcardSession** and **StudySession** entries.
- One **Summary** has many **ChatMessage** records.
- One **User** has many **Job** records.

This ER model supports both persistent learning artifacts and behavioral analytics.

## 6.7. Component Diagram Description

The component diagram can be described across frontend and backend modules.

### Frontend Components

- **Authentication Pages:** registration, login, verification
- **Content Input Component/Page:** URL input, file upload, content options
- **Processing Page:** displays job state and progress feedback
- **Summary Components:** formatted views, tabs, export controls, favorite toggles
- **Quiz Components:** configuration, question rendering, results display
- **Flashcard Components:** study interaction, rating buttons, session results
- **Dashboard Components:** statistics cards, charts, recent activity
- **Library Components:** saved summaries, quizzes, decks, search/filter
- **Settings Components:** profile editing, security settings, preferences
- **Shared Layout Components:** header, sidebar, responsive containers

### Backend Components

- **Router:** maps paths to handlers and middleware
- **Handlers:** authentication, content, summary, quiz, flashcard, dashboard, chat, user settings
- **Services:** auth service, Gemini service, YouTube extraction, file extraction, notification service
- **Repositories:** user repository, content repository, summary repository, quiz repository, flashcard repository, job repository, chat repository, study session repository
- **Worker Pool:** asynchronous job processing and external AI calls
- **WebSocket Hub:** real-time notification delivery
- **Middleware:** authentication, rate limiting, CORS, observability, request logging

The component diagram shows a modular architecture in which presentation, business logic, persistence, and background processing are clearly separated.

## 6.8. Worker Pool Architecture

The worker pool is a crucial architectural element because AI generation tasks are asynchronous, potentially slow, and subject to rate limits from external providers. Handling these tasks directly inside request-response cycles would degrade user experience and reduce backend resilience.

In the worker pool model, jobs are created by the backend API and persisted with a pending status. A configurable pool of workers continuously retrieves available jobs and processes them concurrently. Each worker performs the following high-level sequence: load content, preprocess text, construct prompt, call Gemini, validate output, persist result, update status, and publish notifications.

This architecture has several benefits:

1. **Concurrency.** Multiple jobs can be processed in parallel, improving throughput.
2. **Isolation of long-running tasks.** HTTP request lifetimes remain short because generation occurs in background workers.
3. **Retry control.** Failed jobs can be retried according to defined rules without blocking the user interface.
4. **Rate limiting.** Workers can be coordinated to respect Gemini API quotas and avoid request bursts.
5. **Operational visibility.** Job records make it easier to inspect pending, completed, and failed states.

Rate limiting is especially important. Large language model APIs often enforce request-per-minute or token-based quotas. If many users submit long documents simultaneously, uncontrolled parallelism could trigger provider errors or excessive cost. Therefore, the worker pool must balance concurrency with external service limits.

In summary, the worker pool transforms AI generation from a fragile synchronous process into a manageable and scalable background workflow.

---

# 7. Technology Comparison

## 7.1. Frontend Framework Comparison: React vs Vue vs Angular

Frontend framework selection was critical because Lectura contains many interactive screens, authenticated workflows, asynchronous data states, and reusable UI patterns.

React was selected due to its component-driven architecture, broad ecosystem, TypeScript compatibility, and strong support for modern tooling such as Vite and React Query. React is particularly suitable for applications with dynamic state transitions and modular UI composition.

Vue offers an approachable syntax and excellent developer experience, especially for small to medium projects. Its single-file component model is elegant and productive. However, React’s ecosystem and library maturity remain broader in the context of highly customized application architectures.

Angular is a comprehensive enterprise framework with opinionated structure, dependency injection, and built-in tooling. It is powerful for large teams and standardized code organization, but it introduces greater complexity and a steeper learning curve than necessary for the project’s goals.

**Table 2. React vs Vue vs Angular**

| Criteria | React | Vue | Angular |
|---|---|---|---|
| Performance | High | High | High |
| Learning Curve | Moderate | Low to Moderate | High |
| Ecosystem Size | Very large | Large | Large |
| Flexibility | Very high | High | Moderate |
| TypeScript Experience | Excellent | Good | Excellent |
| Suitability for Lectura | Excellent | Good | Moderate |

**Justification:** React provides the best balance of flexibility, ecosystem support, and integration with the rest of the selected stack.

## 7.2. Backend Language Comparison: Go vs Node.js vs Python

The backend language had to support concurrent I/O, reliable API development, good performance, and maintainable service architecture.

Go was selected because of its simplicity, compiled performance, and strong concurrency model. Goroutines and channels make it well-suited to worker pools, asynchronous job processing, and scalable network services. Go also encourages relatively straightforward service organization with low runtime overhead.

Node.js offers strong developer productivity and a unified JavaScript ecosystem across frontend and backend. It is effective for many web applications, especially when rapid iteration is prioritized. However, CPU-heavy or highly concurrent background-processing designs may require more careful operational management.

Python is highly attractive for AI-related development because of its extensive machine learning ecosystem. However, in this project the AI model is consumed as an external API rather than hosted directly, so Python’s strongest advantage is less central. For a high-performance API and worker system, Go provides a cleaner fit.

**Table 3. Go vs Node.js vs Python**

| Criteria | Go | Node.js | Python |
|---|---|---|---|
| Runtime Performance | Very high | High | Moderate |
| Concurrency Model | Excellent | Good | Moderate |
| Simplicity for APIs | High | High | High |
| AI Library Ecosystem | Moderate | Moderate | Excellent |
| Resource Efficiency | High | Moderate | Moderate |
| Suitability for Lectura | Excellent | Good | Good |

**Justification:** Go is the most appropriate choice for a performant backend with concurrent job processing and low operational complexity.

## 7.3. Database Comparison: PostgreSQL vs MongoDB vs MySQL

Lectura stores structured relational data such as users, content items, summaries, quizzes, attempts, flashcards, sessions, and jobs. These entities have clear relationships and require reliable querying.

PostgreSQL was chosen because it provides strong relational modeling, transactional consistency, advanced indexing, JSON support when needed, and mature tooling. It is highly suitable for systems that combine standard relational entities with occasional semi-structured fields.

MongoDB offers schema flexibility and can be appealing for rapidly changing document-like data. However, the core data model in Lectura is strongly relational, and cross-entity integrity is important.

MySQL is also a capable relational database with broad adoption and good performance. However, PostgreSQL is often preferred for advanced SQL features, rich indexing, and its balance between relational rigor and modern extensibility.

**Table 4. PostgreSQL vs MongoDB vs MySQL**

| Criteria | PostgreSQL | MongoDB | MySQL |
|---|---|---|---|
| Relational Modeling | Excellent | Limited | Excellent |
| Transaction Support | Excellent | Good | Excellent |
| Flexibility | High | Very high | Moderate |
| Advanced Query Features | Excellent | Moderate | Good |
| Suitability for Analytics | High | Moderate | High |
| Suitability for Lectura | Excellent | Moderate | Good |

**Justification:** PostgreSQL aligns best with the structured and interconnected data model of the application.

## 7.4. AI Model Provider Comparison: Gemini vs OpenAI GPT vs Claude

The AI provider comparison focuses on generation quality, latency, multimodal handling potential, developer cost, and integration suitability.

Google Gemini 3 Flash preview was selected for the project because it offers strong generation performance with favorable speed characteristics for interactive educational workflows. In a system that may generate summaries, quizzes, flashcards, and chat responses repeatedly, latency and cost-effectiveness are major concerns.

OpenAI GPT models are highly capable and widely adopted, with strong reasoning and broad developer ecosystem support. They remain a strong alternative, especially for applications requiring premium general-purpose generation.

Anthropic Claude is well regarded for long-context handling and stable prose quality, making it attractive for document-heavy tasks. However, provider choice must also account for access patterns, cost structure, and deployment convenience.

**Table 5. Gemini vs OpenAI GPT vs Claude**

| Criteria | Gemini 3 Flash | OpenAI GPT | Claude |
|---|---|---|---|
| Latency | Excellent | Good | Good |
| Generation Quality | High | Very high | Very high |
| Cost Efficiency | High | Moderate | Moderate |
| Long Context Handling | High | High | Very high |
| Integration Practicality | High | High | High |
| Suitability for Lectura | Excellent | Excellent | Good |

**Justification:** Gemini offers an effective balance of speed, quality, and cost for a student-focused, multi-feature study assistant.

## 7.5. Caching Technology Comparison: Redis vs Memcached vs In-Memory Caching

Caching is useful in Lectura for temporary state, fast-access data, rate-limiting support, and performance optimization.

Redis was chosen because it is more than a cache: it provides rich data structures, persistence options, pub/sub capabilities, and broad use in session and queue-adjacent scenarios. This makes it suitable for real-world application infrastructure beyond simple key-value caching.

Memcached is fast and lightweight for basic caching but lacks the richer functionality that may be useful in a system with job processing, token/session support, and operational growth.

In-memory application caching is simple and has no external dependency, but it is limited in distributed environments and does not survive process restarts. For a deployed cloud application with potentially multiple instances, it is less appropriate as a primary caching strategy.

**Table 6. Redis vs Memcached vs In-Memory Caching**

| Criteria | Redis | Memcached | In-Memory |
|---|---|---|---|
| Performance | High | High | Very high local only |
| Data Structures | Rich | Basic | Application-defined |
| Persistence Options | Yes | No | No |
| Distributed Suitability | Excellent | Good | Poor |
| Operational Flexibility | High | Moderate | Low |
| Suitability for Lectura | Excellent | Moderate | Low |

**Justification:** Redis provides the best long-term flexibility for caching and state-related infrastructure concerns.

## 7.6. Deployment Platform Comparison: Railway vs Heroku vs Render vs AWS

Deployment selection for Lectura had to consider simplicity, developer experience, managed infrastructure, and project scale. As a bachelor project, the platform needed to support realistic deployment without excessive DevOps overhead.

Railway was selected because it offers straightforward deployment workflows, managed services, simple configuration, and rapid iteration for full-stack applications. It is especially attractive for small teams or individual developers who need cloud deployment without building a complex infrastructure pipeline.

Heroku is historically known for excellent developer experience, but its pricing and ecosystem evolution make it less universally attractive than before.

Render provides a comparable modern deployment experience and is a strong alternative for web services and static sites.

AWS offers the greatest flexibility and scalability, but it also introduces much higher complexity. For a diploma project, the operational burden of designing and maintaining a more granular AWS architecture may not be justified.

**Table 7. Railway vs Heroku vs Render vs AWS**

| Criteria | Railway | Heroku | Render | AWS |
|---|---|---|---|---|
| Ease of Deployment | Excellent | Excellent | High | Moderate |
| Infrastructure Control | Moderate | Moderate | Moderate | Very high |
| Cost Predictability | Good | Moderate | Good | Variable |
| Scalability | Good | Good | Good | Excellent |
| Developer Experience | Excellent | Excellent | High | Moderate |
| Suitability for Lectura | Excellent | Good | Good | Moderate |

**Justification:** Railway delivers the strongest combination of low operational friction and sufficient capability for the scope of the project.

---

# 8. Mockups of the Project

## 8.1. Design System Overview

The interface design of Lectura follows a modern study-oriented design system built around a primary navy color `#1a1a2e`. This color was chosen to communicate focus, professionalism, and visual stability, which are desirable qualities in an educational productivity application.

The frontend styling is implemented with Tailwind CSS utility classes, enabling consistent spacing, typography, responsive layout behavior, and reusable component patterns. The system supports both dark mode and light mode to accommodate user preference, screen comfort, and extended study sessions.

The design philosophy emphasizes the following principles:

- clarity over decorative complexity;
- strong information hierarchy;
- minimal friction in task-oriented flows;
- responsive behavior across desktop and mobile widths;
- reusable card, button, badge, and form patterns;
- visible progress and state feedback for asynchronous AI tasks.

## 8.2. Landing Page

**Purpose:**  
The landing page introduces Lectura to new users, communicates its value proposition, and encourages account creation or login.

**Main UI Elements:**
- hero section with headline and supporting text;
- primary call-to-action buttons for registration and login;
- feature cards explaining summaries, quizzes, flashcards, and AI chat;
- trust and technology indicators;
- responsive navigation bar;
- footer with project and informational links.

**User Interactions:**
Users can read the platform description, explore features, and navigate directly to registration or authentication. Scrolling reveals additional explanation and social proof style sections.

**Key Design Decisions:**
The landing page should quickly answer three questions: what the product does, why it matters, and what action the visitor should take next. The hero must therefore be concise and visually strong, using the navy brand identity and a clean two-column layout on desktop.

## 8.3. Registration Page

**Purpose:**  
The registration page enables new users to create an account and begin using the platform.

**Main UI Elements:**
- registration form with name, email, password, and confirmation;
- optional Google OAuth button;
- validation messages;
- terms acknowledgment text;
- link to login page.

**User Interactions:**
Users enter their credentials, submit the form, and receive feedback on validation state. If registration succeeds, the user may be redirected to verification or onboarding.

**Key Design Decisions:**
The layout should minimize distraction and communicate security and simplicity. Form validation must be clear but non-intrusive, and mobile responsiveness is essential.

## 8.4. Login Page

**Purpose:**  
The login page authenticates returning users and provides access to protected features.

**Main UI Elements:**
- email and password fields;
- login button;
- “forgot password” or recovery link if supported;
- Google OAuth login option;
- error state area for invalid credentials;
- link to registration page.

**User Interactions:**
Users submit credentials or choose OAuth. Error states are displayed inline. On success, users are redirected to the dashboard or content upload area.

**Key Design Decisions:**
The login form should feel fast, secure, and familiar. Focus states, keyboard accessibility, and high contrast are important for usability.

## 8.5. Content Upload Page

**Purpose:**  
The content upload page is the main entry point for study generation. It allows users to submit a YouTube URL, upload a PDF/document, or paste text.

**Main UI Elements:**
- segmented input modes or tabs;
- YouTube URL field;
- drag-and-drop upload zone for files;
- text area for pasted content;
- generation type selectors;
- submit button;
- content tips and accepted format information.

**User Interactions:**
Users choose an input mode, provide content, optionally configure generation preferences, and submit the job.

**Key Design Decisions:**
Because this page starts the entire workflow, it must be intuitive and forgiving. Inputs should be visually separated, error messages should explain exactly what went wrong, and the submit action should clearly indicate that background processing will begin.

## 8.6. Processing Page

**Purpose:**  
The processing page informs the user that the system is currently extracting, analyzing, or generating content.

**Main UI Elements:**
- animated progress indicator;
- job status label;
- brief explanation of current processing step;
- optional estimated wait information;
- cancel or return action if supported.

**User Interactions:**
Users monitor progress while the system processes the request. Real-time updates are delivered via WebSocket so that the status can change without refreshing the page.

**Key Design Decisions:**
Long-running AI operations can create uncertainty. The page should therefore reduce anxiety by showing meaningful status transitions such as validating, extracting, generating, and finalizing.

## 8.7. Summary Page with Four Format Tabs

**Purpose:**  
The summary page displays the generated summary and serves as the central review screen for processed content.

**Main UI Elements:**
- summary title and source metadata;
- four tabs: Cornell, Bullets, Paragraph, Smart;
- export PDF button;
- favorite/bookmark control;
- “open quiz” and “study flashcards” actions;
- integrated AI chat panel or drawer;
- related content navigation.

**User Interactions:**
Users switch between summary formats, read the material, export it, save it, or continue into quiz and flashcard workflows. They can also ask follow-up questions through the AI chat assistant.

**Key Design Decisions:**
The four-tab design supports different study preferences without duplicating navigation. The summary must remain readable, with strong typography and spacing. The AI chat should be present but not visually overwhelming.

## 8.8. Quiz Configuration Page

**Purpose:**  
The quiz configuration page allows the user to define quiz parameters before generation or before starting a quiz.

**Main UI Elements:**
- number of questions selector;
- difficulty selector;
- question type explanation;
- source reference panel;
- generate/start button.

**User Interactions:**
Users choose quiz settings and initiate the quiz generation flow.

**Key Design Decisions:**
The configuration page should expose only the most meaningful options to avoid decision fatigue. It should guide the user toward a good default configuration while still allowing moderate personalization.

## 8.9. Quiz Taking Page

**Purpose:**  
The quiz taking page supports active self-assessment through multiple-choice questions.

**Main UI Elements:**
- question stem;
- answer options;
- progress indicator;
- next/previous controls;
- timer or elapsed session display if desired;
- submit quiz button.

**User Interactions:**
Users read each question, choose answers, navigate through the quiz, and submit their final response set.

**Key Design Decisions:**
The page should reduce cognitive overload by presenting one question or one clear group of questions at a time. Selected states must be visually obvious, and accidental submission should be prevented.

## 8.10. Quiz Results Page

**Purpose:**  
The quiz results page communicates performance and supports reflection after self-assessment.

**Main UI Elements:**
- total score;
- percentage and performance badge;
- list of questions with correct and incorrect answers;
- explanations if available;
- retry button;
- navigation to summary or flashcards.

**User Interactions:**
Users review mistakes, inspect correct answers, and decide on next steps such as retrying or studying flashcards.

**Key Design Decisions:**
Results should be educational rather than merely evaluative. The design should emphasize learning from errors and encourage continued practice.

## 8.11. Flashcard Study Page

**Purpose:**  
The flashcard study page supports active recall and repeated rehearsal.

**Main UI Elements:**
- current flashcard front;
- reveal answer control;
- difficulty/rating buttons such as Again, Hard, Good, Easy;
- progress indicator;
- exit session action.

**User Interactions:**
Users attempt recall, reveal the answer, and rate difficulty. These interactions feed spaced repetition or session analytics.

**Key Design Decisions:**
The flashcard interface should be distraction-free and highly readable. Since recall is the primary task, the design must highlight the card content above all else.

## 8.12. Flashcard Results Page

**Purpose:**  
The flashcard results page summarizes the outcomes of a study session.

**Main UI Elements:**
- cards studied count;
- performance breakdown by rating;
- total session time;
- suggestions for next review;
- buttons to continue or return to library.

**User Interactions:**
Users review how the session went and determine whether to continue studying or stop.

**Key Design Decisions:**
The interface should reinforce accomplishment and provide enough information for self-regulation without overwhelming the learner with excessive analytics.

## 8.13. Dashboard Page

**Purpose:**  
The dashboard provides an overview of user activity, learning progress, and recent study materials.

**Main UI Elements:**
- summary cards for quizzes taken, flashcards reviewed, and study time;
- activity charts;
- recent content list;
- quick actions to upload new content or resume a study item;
- streak or consistency widget if supported.

**User Interactions:**
Users inspect learning patterns, return to previous materials, and start new study workflows.

**Key Design Decisions:**
The dashboard should motivate without distracting. Metrics must be meaningful and visually digestible. Priority should be given to quick resumption of study tasks.

## 8.14. Library Page

**Purpose:**  
The library page stores and organizes previously generated learning materials.

**Main UI Elements:**
- searchable list or grid of content items;
- filters for summaries, quizzes, flashcards, favorites, and recent items;
- content cards with titles, dates, and status markers;
- quick actions for open, export, delete, or favorite.

**User Interactions:**
Users browse saved materials, search for past study resources, and reopen or manage them.

**Key Design Decisions:**
Because the library becomes more important over time, information architecture and filtering are critical. The design should support scale without becoming cluttered.

## 8.15. Settings Page

**Purpose:**  
The settings page allows users to manage profile details, preferences, and security-related options.

**Main UI Elements:**
- profile form;
- password change controls;
- theme selection;
- notification preferences;
- account management actions;
- connected Google account indicator if applicable.

**User Interactions:**
Users update account data, switch themes, modify security settings, and manage integrations.

**Key Design Decisions:**
Settings should be grouped by category and designed for clarity. Security-related actions must include confirmation and visible success/error feedback.

---

# 9. References

[1] W. Holmes, M. Bialik, and C. Fadel, *Artificial Intelligence in Education: Promises and Implications for Teaching and Learning*. Boston, MA, USA: Center for Curriculum Redesign, 2019.

[2] R. Luckin and M. Cukurova, “Designing educational technologies in the age of AI: A learning sciences-driven approach,” *British Journal of Educational Technology*, vol. 50, no. 6, pp. 2824–2838, 2019.

[3] R. Mihalcea and P. Tarau, “TextRank: Bringing order into texts,” in *Proceedings of the 2004 Conference on Empirical Methods in Natural Language Processing*, Barcelona, Spain, 2004, pp. 404–411.

[4] A. See, P. J. Liu, and C. D. Manning, “Get to the point: Summarization with pointer-generator networks,” in *Proceedings of the 55th Annual Meeting of the Association for Computational Linguistics*, Vancouver, Canada, 2017, pp. 1073–1083.

[5] I. Mani, *Automatic Summarization*. Amsterdam, Netherlands: John Benjamins, 2001.

[6] H. Ebbinghaus, *Memory: A Contribution to Experimental Psychology*. New York, NY, USA: Teachers College, Columbia University, 1913.

[7] N. J. Cepeda, H. Pashler, E. Vul, J. T. Wixted, and D. Rohrer, “Distributed practice in verbal recall tasks: A review and quantitative synthesis,” *Psychological Bulletin*, vol. 132, no. 3, pp. 354–380, 2006.

[8] H. L. Roediger III and J. D. Karpicke, “Test-enhanced learning: Taking memory tests improves long-term retention,” *Psychological Science*, vol. 17, no. 3, pp. 249–255, 2006.

[9] G. Kurdi, J. Leo, and B. Parsia, “A systematic review of automatic question generation for educational purposes,” *International Journal of Artificial Intelligence in Education*, vol. 30, no. 1, pp. 121–204, 2020.

[10] R. Winkler and M. Söllner, “Unleashing the potential of chatbots in education: A state-of-the-art analysis,” *Academy of Management Annual Meeting Proceedings*, vol. 2018, no. 1, pp. 15903, 2018.

[11] E. Kasneci et al., “ChatGPT for good? On opportunities and challenges of large language models for education,” *Learning and Individual Differences*, vol. 103, article 102274, 2023.

[12] B. Woolf, *Building Intelligent Interactive Tutors*. Burlington, MA, USA: Morgan Kaufmann, 2009.

[13] J. Lester, S. Converse, S. Kahler, S. Barlow, B. Stone, and R. Bhogal, “The persona effect: Affective impact of animated pedagogical agents,” in *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, Atlanta, GA, USA, 1997, pp. 359–366.

[14] S. K. D’Mello and A. Graesser, “AutoTutor and affective autoregulation in learning,” *International Journal of Artificial Intelligence in Education*, vol. 22, no. 1–2, pp. 7–30, 2012.

[15] A. Fiorella and R. E. Mayer, *Learning as a Generative Activity: Eight Learning Strategies That Promote Understanding*. New York, NY, USA: Cambridge University Press, 2015.
