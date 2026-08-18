// Local, offline resume parser.
//
// Fallback used when Gemini is unavailable — no GEMINI_API_KEY, a failed call,
// a quota error, or a response that comes back empty. Dependency-light: DOCX
// text comes from mammoth (already a dependency), PDF text from pdf-parse.
//
// It will never match the AI parser, but it means "Fill profile from resume"
// always does something instead of silently failing.
import fs from 'fs';
import mammoth from 'mammoth';

const SKILL_DICTIONARY = [
  'JavaScript', 'TypeScript', 'Java', 'Python', 'C#', 'C++', 'Go', 'Golang', 'Ruby',
  'PHP', 'Swift', 'Kotlin', 'Scala', 'Rust', 'Perl', 'MATLAB', 'Dart', 'Elixir',
  'React', 'React Native', 'Angular', 'Vue', 'Vue.js', 'Next.js', 'Nuxt', 'Svelte',
  'Redux', 'jQuery', 'HTML', 'HTML5', 'CSS', 'CSS3', 'SASS', 'SCSS', 'Tailwind',
  'Bootstrap', 'Material UI', 'Webpack', 'Vite', 'Babel',
  'Node.js', 'Express', 'Express.js', 'Spring', 'Spring Boot', 'Hibernate', 'JPA',
  'Django', 'Flask', 'FastAPI', 'Laravel', 'Rails', 'Ruby on Rails', '.NET',
  'ASP.NET', 'NestJS', 'GraphQL', 'REST', 'REST API', 'RESTful', 'gRPC',
  'Microservices', 'JUnit', 'Mockito', 'Servlets', 'JSP',
  'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Oracle', 'SQL Server', 'SQLite',
  'Redis', 'Cassandra', 'DynamoDB', 'Elasticsearch', 'Firebase', 'Snowflake',
  'NoSQL', 'PL/SQL',
  'AWS', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Jenkins',
  'Terraform', 'Ansible', 'CI/CD', 'GitHub Actions', 'GitLab CI', 'CircleCI',
  'Lambda', 'EC2', 'S3', 'RDS', 'CloudFormation', 'Nginx', 'Apache', 'Linux',
  'Unix', 'Bash', 'Shell Scripting', 'Kafka', 'RabbitMQ', 'Prometheus', 'Grafana',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy',
  'Scikit-learn', 'Spark', 'Hadoop', 'Airflow', 'Tableau', 'Power BI', 'ETL',
  'Data Analysis', 'Data Modeling', 'NLP',
  'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence', 'Agile', 'Scrum',
  'Kanban', 'TDD', 'Selenium', 'Cypress', 'Jest', 'Postman', 'Swagger', 'Figma',
  'SDLC', 'OOP', 'Design Patterns', 'Data Structures', 'Algorithms'
];

const TITLE_PATTERNS = [
  'Principal Software Engineer', 'Staff Software Engineer', 'Senior Software Engineer',
  'Lead Software Engineer', 'Software Development Engineer', 'Java Full Stack Developer',
  'Full Stack Developer', 'Full-Stack Developer', 'Frontend Developer',
  'Front End Developer', 'Front-End Developer', 'Backend Developer',
  'Back End Developer', 'Back-End Developer', 'Software Engineer',
  'Software Developer', 'Web Developer', 'Application Developer', 'Mobile Developer',
  'Android Developer', 'iOS Developer', 'React Developer', 'Java Developer',
  'Python Developer', 'Node Developer', '.NET Developer', 'DevOps Engineer',
  'Site Reliability Engineer', 'Cloud Engineer', 'Platform Engineer',
  'Data Engineer', 'Data Scientist', 'Data Analyst', 'Business Analyst',
  'Machine Learning Engineer', 'QA Engineer', 'Test Engineer',
  'Automation Engineer', 'Systems Engineer', 'Solutions Architect',
  'Software Architect', 'Technical Lead', 'Tech Lead', 'Engineering Manager',
  'Product Manager', 'Project Manager', 'Scrum Master', 'UI/UX Designer',
  'UX Designer', 'Database Administrator', 'Security Engineer'
];

const US_STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';

const COUNTRIES = [
  'United States', 'USA', 'United Kingdom', 'India', 'Canada', 'Australia',
  'Germany', 'France', 'Singapore', 'Ireland', 'Netherlands', 'Spain', 'Japan'
];

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function extractText(filePath, mimeType = '') {
  if (!filePath || !fs.existsSync(filePath)) return '';

  const isPdf =
    mimeType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
      const { default: pdfParse } = await import('pdf-parse');
      const data = await pdfParse(fs.readFileSync(filePath));
      return String(data.text || '');
    } catch (error) {
      console.error('resumeParse: PDF extraction failed:', error.message);
      return '';
    }
  }

  try {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return String(value || '');
  } catch (error) {
    console.error('resumeParse: DOCX extraction failed:', error.message);
    return '';
  }
}

function findPhone(text) {
  const match = text.match(
    /(\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
  );
  return match ? match[0].trim() : '';
}

function findEmail(text) {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : '';
}

function findLocation(text) {
  const head = text.slice(0, 1200);

  // Space (not \s) so a city name can never absorb the previous line.
  const cityState = head.match(
    new RegExp(`(^|[^A-Za-z])([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+)?), *(${US_STATES})\\b`, 'm')
  );
  if (cityState) return `${cityState[2]}, ${cityState[3]}`;

  for (const country of COUNTRIES) {
    if (new RegExp(`\\b${escapeRe(country)}\\b`, 'i').test(head)) return country;
  }
  return '';
}

function findSkills(text) {
  const hits = [];

  for (const skill of SKILL_DICTIONARY) {
    const regex = new RegExp(
      `(^|[^A-Za-z0-9+#.])${escapeRe(skill)}([^A-Za-z0-9+#]|$)`,
      'i'
    );
    const match = regex.exec(text);
    if (match) hits.push({ skill, at: match.index });
  }

  // Order by first appearance so the resume's own emphasis survives the cut,
  // rather than whatever order the dictionary happens to be written in.
  hits.sort((a, b) => a.at - b.at);
  const found = hits.map((hit) => hit.skill);

  const redundant = {
    Golang: 'Go',
    'Vue.js': 'Vue',
    'Express.js': 'Express',
    'Ruby on Rails': 'Rails',
    HTML5: 'HTML',
    CSS3: 'CSS',
    'Google Cloud': 'GCP',
    'REST API': 'REST',
    RESTful: 'REST'
  };
  for (const [specific, broad] of Object.entries(redundant)) {
    if (found.includes(specific)) {
      const index = found.indexOf(broad);
      if (index > -1) found.splice(index, 1);
    }
  }

  return found.slice(0, 20);
}

function findExperienceYears(text) {
  const explicit = text.match(
    /(\d{1,2})\s*\+?\s*years?(?:\s+of)?\s+(?:professional\s+|industry\s+|relevant\s+|hands-on\s+)?experience/i
  );
  if (explicit) {
    const years = Number(explicit[1]);
    if (years > 0 && years < 50) return years;
  }

  const currentYear = new Date().getFullYear();
  const years = (text.match(/\b(19[89]\d|20[0-4]\d)\b/g) || [])
    .map(Number)
    .filter((year) => year >= 1985 && year <= currentYear);

  if (!years.length) return 0;

  const span = currentYear - Math.min(...years);
  return span > 0 && span < 45 ? span : 0;
}

function findTitle(text) {
  // The headline title sits in the first few lines, above the contact block.
  // Search that narrow window before falling back to the whole document, so a
  // job title from the EXPERIENCE section cannot outrank the candidate's own.
  const header = text.split(/\r?\n/).slice(0, 6).join('\n');

  for (const title of TITLE_PATTERNS) {
    if (new RegExp(`\\b${escapeRe(title)}\\b`, 'i').test(header)) return title;
  }
  for (const title of TITLE_PATTERNS) {
    if (new RegExp(`\\b${escapeRe(title)}\\b`, 'i').test(text.slice(0, 900))) return title;
  }
  for (const title of TITLE_PATTERNS) {
    if (new RegExp(`\\b${escapeRe(title)}\\b`, 'i').test(text)) return title;
  }
  return '';
}

function findSummary(text) {
  const section = text.match(
    /(?:professional\s+summary|career\s+summary|summary|profile|objective)\s*[:\n\r-]+([\s\S]{60,900}?)(?:\n\s*\n|\n\s*(?:technical\s+skills|skills|experience|work\s+experience|employment|education|projects|certifications)\b)/i
  );

  if (section && section[1]) {
    const cleaned = section[1].replace(/\s+/g, ' ').trim();
    if (cleaned.length > 50) return cleaned.slice(0, 600);
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(
      (block) =>
        block.length > 80 &&
        !block.includes('@') &&
        !/^\s*(?:technical\s+)?skills\b/i.test(block)
    );

  return paragraphs.length ? paragraphs[0].slice(0, 600) : '';
}

// Mirrors the shape returned by analyzeResume() in resumeAI.js
async function parseResumeLocally(filePath, mimeType) {
  const text = await extractText(filePath, mimeType);

  if (!text || text.trim().length < 40) {
    return {
      professionalTitle: '', experienceYears: 0, skills: [],
      professionalSummary: '', location: '', phone: '', email: '', _empty: true
    };
  }

  return {
    professionalTitle: findTitle(text),
    experienceYears: findExperienceYears(text),
    skills: findSkills(text),
    professionalSummary: findSummary(text),
    location: findLocation(text),
    phone: findPhone(text),
    email: findEmail(text)
  };
}

export { parseResumeLocally, extractText };
