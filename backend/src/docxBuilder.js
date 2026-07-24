// Build a clean, ATS-friendly .docx resume from the structured rewrite JSON.
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle
} from 'docx';

const PURPLE = '6D28D9';
const GREY = '666666';

function heading(text) {
  return new Paragraph({
    spacing: { before: 220, after: 60 },
    border: { bottom: { color: 'DDDDDD', space: 1, size: 6, style: BorderStyle.SINGLE } },
    children: [new TextRun({ text, bold: true, color: PURPLE, size: 24 })]
  });
}

async function buildResumeDocx(data = {}) {
  const children = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: data.name || 'Candidate', bold: true, size: 40 })]
  }));
  if (data.title) {
    children.push(new Paragraph({
      children: [new TextRun({ text: data.title, bold: true, color: PURPLE, size: 26 })]
    }));
  }
  if (data.contact) {
    children.push(new Paragraph({
      children: [new TextRun({ text: data.contact, size: 20, color: GREY })]
    }));
  }

  if (data.summary) {
    children.push(heading('PROFESSIONAL SUMMARY'));
    children.push(new Paragraph({ children: [new TextRun({ text: data.summary, size: 22 })] }));
  }

  if (Array.isArray(data.skills) && data.skills.length) {
    children.push(heading('SKILLS'));
    children.push(new Paragraph({
      children: [new TextRun({ text: data.skills.join('  ·  '), size: 22 })]
    }));
  }

  if (Array.isArray(data.experience) && data.experience.length) {
    children.push(heading('EXPERIENCE'));
    for (const exp of data.experience) {
      children.push(new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: `${exp.role || ''}${exp.company ? ' — ' + exp.company : ''}`, bold: true, size: 22 }),
          ...(exp.dates ? [new TextRun({ text: `    ${exp.dates}`, italics: true, size: 20, color: GREY })] : [])
        ]
      }));
      for (const bullet of (exp.bullets || [])) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: String(bullet), size: 22 })]
        }));
      }
    }
  }

  if (Array.isArray(data.education) && data.education.length) {
    children.push(heading('EDUCATION'));
    for (const ed of data.education) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `${ed.credential || ''}${ed.institution ? ', ' + ed.institution : ''}${ed.year ? ' (' + ed.year + ')' : ''}`,
          size: 22
        })]
      }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export { buildResumeDocx };
