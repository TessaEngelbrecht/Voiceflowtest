

const API_KEY = 'VF.DM.66d73158b9711e36ebe1d627.0jXt946XTFyv4KpQ';
const USER_ID = 'web-user-' + Math.random().toString(36).substring(7);

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Word document templates
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

const documentTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p>
            <w:r>
                <w:t>{content}</w:t>
            </w:r>
        </w:p>
    </w:body>
</w:document>`;

async function createWordDoc(content) {
    const zip = new JSZip();

    // Create the required files
    zip.file("[Content_Types].xml", contentTypes);
    zip.file("_rels/.rels", rels);

    // Create the word directory
    const wordFolder = zip.folder("word");
    wordFolder.file("_rels/document.xml.rels", documentRels);

    // Create document.xml with the content
    const documentXml = documentTemplate.replace('{content}', content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/\n/g, '</w:t></w:r></w:p><w:p><w:r><w:t>')  // Handle line breaks
    );

    wordFolder.file("document.xml", documentXml);

    // Generate the .docx file
    const blob = await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    return blob;
}

async function downloadAsWord(content) {
    try {
        const blob = await createWordDoc(content);
        saveAs(blob, "chatbot-response.docx");
    } catch (error) {
        console.error('Error creating Word document:', error);
        // Fallback to txt if Word creation fails
        const txtBlob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        saveAs(txtBlob, "chatbot-response.txt");
    }
}

function addMessage(message, isUser = false, isPdf = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

    if (isPdf) {
        const pdfNote = document.createElement('div');
        pdfNote.className = 'pdf-content';
        pdfNote.textContent = '📎 PDF Content:';
        messageDiv.appendChild(pdfNote);
    }

    messageDiv.appendChild(document.createTextNode(message));

    // Add download button for bot messages longer than 10 characters
    if (!isUser && message.length > 300) {
        const downloadButton = document.createElement('button');
        downloadButton.className = 'download-button';
        downloadButton.innerHTML = `
            <svg class="download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Save as Word
        `;
        downloadButton.onclick = () => downloadAsWord(message);
        messageDiv.appendChild(downloadButton);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function interact(request) {
    try {
        const response = await axios.post(
            `https://general-runtime.voiceflow.com/state/user/${USER_ID}/interact`,
            { request: request },
            {
                headers: {
                    'Authorization': API_KEY,
                    'versionID': 'production',
                    'accept': 'application/json',
                    'content-type': 'application/json'
                }
            }
        );

        const traces = response.data;
        for (let trace of traces) {
            if (trace.type === 'text') {
                addMessage(trace.payload.message);
            }
        }
    } catch (error) {
        console.error('Error interacting with Voiceflow:', error);
        addMessage('Sorry, there was an error processing your request.');
    }
}

async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();

    if (message) {
        addMessage(message, true);
        userInput.value = '';

        await interact({ type: 'text', payload: message });
    }
}

async function extractTextFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    return fullText.trim();
}

// Handle PDF upload
document.getElementById('pdfUpload').addEventListener('change', async function (e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const progressDiv = document.getElementById('uploadProgress');

        try {
            progressDiv.style.display = 'block';
            const text = await extractTextFromPdf(file);

            // Add the PDF content as a message
            addMessage(`Uploaded PDF: ${file.name}\n\n${text.substring(0, 200)}...`, true, true);

            // Send the content to Voiceflow
            await interact({
                type: 'text',
                payload: `Processing PDF content: ${text.substring(0, 1000)}...`
            });

        } catch (error) {
            console.error('Error processing PDF:', error);
            addMessage('Sorry, there was an error processing the PDF file.');
        } finally {
            progressDiv.style.display = 'none';
            e.target.value = ''; // Reset file input
        }
    }
});

// Handle Enter key press
document.getElementById('userInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Launch the conversation when the page loads
window.onload = function () {
    interact({ type: 'launch' });
};