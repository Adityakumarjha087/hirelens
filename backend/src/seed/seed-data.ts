/* Realistic demo data. Resumes are rendered to plain-text files and pushed through the real pipeline. */

export interface SeedRole {
  title: string;
  company: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface SeedCandidate {
  email: string;
  name: string;
  headline: string;
  location: string;
  summary: string;
  skills: string[];
  roles: SeedRole[];
  education: string;
  projects: string[];
}

export interface SeedJob {
  recruiter: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salaryMin: number;
  salaryMax: number;
  blindScreening: boolean;
  description: string;
}

export const DEMO_PASSWORD = 'Password123!';

export const RECRUITERS = [
  { email: 'recruiter@hirelens.dev', name: 'Morgan Reyes', company: 'Northwind Labs' },
  { email: 'talent@hirelens.dev', name: 'Avery Chen', company: 'Lumen Health' },
];

export const ADMIN = { email: 'admin@hirelens.dev', name: 'Platform Admin' };

export const CANDIDATES: SeedCandidate[] = [
  {
    email: 'candidate@hirelens.dev',
    name: 'Priya Sharma',
    headline: 'Senior Backend Engineer',
    location: 'San Francisco, CA',
    summary:
      'Backend engineer with 8 years of experience building distributed payment systems in Python and Go. Led the migration of a monolith to microservices on Kubernetes.',
    skills: [
      'Python',
      'Go',
      'PostgreSQL',
      'Redis',
      'Kafka',
      'Docker',
      'Kubernetes',
      'AWS',
      'Terraform',
      'FastAPI',
      'gRPC',
    ],
    roles: [
      {
        title: 'Senior Software Engineer',
        company: 'Stripe Inc',
        start: 'Mar 2021',
        end: 'Present',
        bullets: [
          'Led the redesign of the payouts ledger, reducing reconciliation errors by 42%',
          'Built a Kafka-based event pipeline processing 25M events/day with p99 latency under 80 ms',
          'Mentored 4 engineers and introduced design reviews across the team',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Dropbox',
        start: 'Jun 2017',
        end: 'Feb 2021',
        bullets: [
          'Responsible for maintaining the file metadata service',
          'Reduced infrastructure cost by $1.2M/year by optimizing PostgreSQL query plans',
        ],
      },
    ],
    education: 'B.S. in Computer Science, University of California Berkeley, 2017',
    projects: ['OpenLedger — Open-source double-entry accounting library in Python and PostgreSQL'],
  },
  {
    email: 'diego.alvarez@example.com',
    name: 'Diego Alvarez',
    headline: 'Full-Stack Engineer',
    location: 'Austin, TX',
    summary:
      'Full-stack engineer with 5 years of experience shipping React and Node.js products used by millions.',
    skills: [
      'TypeScript',
      'React',
      'Node.js',
      'NestJS',
      'PostgreSQL',
      'GraphQL',
      'Docker',
      'AWS',
      'Jest',
      'Playwright',
    ],
    roles: [
      {
        title: 'Senior Full-Stack Engineer',
        company: 'Shopify',
        start: 'Jan 2022',
        end: 'Present',
        bullets: [
          'Built the merchant analytics dashboard in React and GraphQL used by 300k merchants',
          'Cut checkout API latency by 35% by introducing Redis caching in a NestJS service',
          'Worked on the design system migration to Tailwind CSS',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Indeed',
        start: 'Jul 2019',
        end: 'Dec 2021',
        bullets: [
          'Developed job search filters in TypeScript and Node.js',
          'Wrote Playwright end-to-end tests for critical flows',
        ],
      },
    ],
    education: 'B.S. in Software Engineering, University of Texas at Austin, 2019',
    projects: ['TaskForge — Real-time collaborative task board built with React, Node.js and WebSockets'],
  },
  {
    email: 'mei.tanaka@example.com',
    name: 'Mei Tanaka',
    headline: 'Machine Learning Engineer',
    location: 'Seattle, WA',
    summary: 'ML engineer with 6 years of experience in NLP, LLMs and production MLOps on AWS.',
    skills: [
      'Python',
      'PyTorch',
      'NLP',
      'LLMs',
      'RAG',
      'Hugging Face',
      'scikit-learn',
      'AWS',
      'Docker',
      'Airflow',
      'MLOps',
    ],
    roles: [
      {
        title: 'Machine Learning Engineer',
        company: 'Amazon',
        start: 'Apr 2020',
        end: 'Present',
        bullets: [
          'Shipped a retrieval-augmented generation assistant serving 2M queries/month with 92% answer acceptance',
          'Reduced model inference cost by 48% through distillation and batching on GPU',
          'Built Airflow pipelines for weekly retraining with automated evaluation gates',
        ],
      },
      {
        title: 'Data Scientist',
        company: 'Zillow',
        start: 'Aug 2018',
        end: 'Mar 2020',
        bullets: ['Developed pricing models with scikit-learn improving MAE by 11%'],
      },
    ],
    education: 'M.S. in Computer Science, University of Washington, 2018',
    projects: ['ResumeRanker — Semantic resume search with sentence-transformers and a vector database'],
  },
  {
    email: 'samuel.okafor@example.com',
    name: 'Samuel Okafor',
    headline: 'DevOps Engineer',
    location: 'London',
    summary: 'Platform engineer focused on Kubernetes, Terraform and CI/CD with 7 years of experience.',
    skills: [
      'Kubernetes',
      'Terraform',
      'AWS',
      'GCP',
      'Docker',
      'CI/CD',
      'GitHub Actions',
      'Prometheus',
      'Grafana',
      'Linux',
      'Python',
      'Bash',
    ],
    roles: [
      {
        title: 'Senior Platform Engineer',
        company: 'Monzo',
        start: 'Feb 2020',
        end: 'Present',
        bullets: [
          'Migrated 120 services to Kubernetes with zero downtime',
          'Built GitHub Actions pipelines that cut deploy time from 40 to 8 minutes',
          'Introduced SLOs with Prometheus and Grafana, reducing P1 incidents by 30%',
        ],
      },
      {
        title: 'DevOps Engineer',
        company: 'Sky',
        start: 'Sep 2017',
        end: 'Jan 2020',
        bullets: ['Automated infrastructure provisioning with Terraform across 3 AWS regions'],
      },
    ],
    education: 'B.Eng. in Electronic Engineering, Imperial College London, 2017',
    projects: [],
  },
  {
    email: 'hannah.berg@example.com',
    name: 'Hannah Berg',
    headline: 'Junior Frontend Developer',
    location: 'Berlin',
    summary: 'Frontend developer with 1 year of experience building accessible React interfaces.',
    skills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Tailwind CSS', 'Vite', 'Jest', 'Figma'],
    roles: [
      {
        title: 'Frontend Developer',
        company: 'Zalando',
        start: 'Sep 2024',
        end: 'Present',
        bullets: [
          'Helped build the new returns flow in React',
          'Worked on accessibility fixes across the product catalog',
        ],
      },
    ],
    education: 'B.Sc. in Media Informatics, Technical University of Berlin, 2024',
    projects: ['PixelPal — Accessible color palette generator built with React, Vite and Tailwind CSS'],
  },
  {
    email: 'arjun.mehta@example.com',
    name: 'Arjun Mehta',
    headline: 'Data Engineer',
    location: 'Bangalore',
    summary:
      'Data engineer with 4 years of experience building batch and streaming pipelines with Spark and Kafka.',
    skills: ['Python', 'SQL', 'Spark', 'Kafka', 'Airflow', 'dbt', 'Snowflake', 'AWS', 'Docker'],
    roles: [
      {
        title: 'Data Engineer',
        company: 'Flipkart',
        start: 'Jan 2021',
        end: 'Present',
        bullets: [
          'Built streaming ingestion with Kafka and Spark handling 4TB/day',
          'Modeled the finance warehouse in dbt and Snowflake, cutting report runtime by 70%',
        ],
      },
    ],
    education: 'B.Tech in Computer Science, Indian Institute of Technology Bombay, 2020',
    projects: [],
  },
  {
    email: 'lena.fischer@example.com',
    name: 'Lena Fischer',
    headline: 'Product Designer',
    location: 'Amsterdam',
    summary: 'Product designer with 6 years of experience in UX research and design systems.',
    skills: ['UX Design', 'Figma', 'Product Management', 'Communication', 'HTML', 'CSS'],
    roles: [
      {
        title: 'Senior Product Designer',
        company: 'Booking.com',
        start: 'May 2019',
        end: 'Present',
        bullets: [
          'Led the redesign of the host onboarding flow, increasing completion by 18%',
          'Ran 40+ usability studies',
        ],
      },
    ],
    education: 'M.A. in Interaction Design, Delft University of Technology, 2018',
    projects: [],
  },
  {
    email: 'kwame.mensah@example.com',
    name: 'Kwame Mensah',
    headline: 'Backend Engineer',
    location: 'Toronto',
    summary: 'Backend engineer with 3 years of experience in Java, Spring Boot and PostgreSQL.',
    skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker', 'Kubernetes', 'REST APIs', 'Redis'],
    roles: [
      {
        title: 'Software Engineer',
        company: 'Wealthsimple',
        start: 'Jun 2022',
        end: 'Present',
        bullets: [
          'Built REST APIs in Spring Boot for the trading platform handling 50k requests/minute',
          'Worked on PostgreSQL schema migrations for the accounts service',
        ],
      },
    ],
    education: 'B.S. in Computer Science, University of Toronto, 2022',
    projects: ['Ledgerly — Personal finance tracker in Java and Spring Boot'],
  },
];

export const JOBS: SeedJob[] = [
  {
    recruiter: 0,
    title: 'Senior Backend Engineer (Payments)',
    company: 'Northwind Labs',
    location: 'San Francisco, CA',
    remote: true,
    salaryMin: 170000,
    salaryMax: 220000,
    blindScreening: true,
    description: `About the role
Northwind Labs is building the payments infrastructure for the next generation of marketplaces. You will own core ledger and payout services.

Requirements:
- 5+ years of experience building backend services with Python or Go
- Strong PostgreSQL and data modeling skills
- Production experience with Kafka, Docker and Kubernetes
- System design experience with distributed systems

Nice to have:
- Terraform, AWS
- Experience with gRPC is a plus`,
  },
  {
    recruiter: 0,
    title: 'Full-Stack Engineer (React / Node.js)',
    company: 'Northwind Labs',
    location: 'Austin, TX',
    remote: false,
    salaryMin: 130000,
    salaryMax: 170000,
    blindScreening: false,
    description: `What you'll do
Build delightful merchant-facing products end to end.

Requirements:
- 3+ years of experience with TypeScript, React and Node.js
- Experience with PostgreSQL and REST or GraphQL APIs
- Testing with Jest or Playwright

Nice to have:
- NestJS, Docker
- Tailwind CSS experience is a plus`,
  },
  {
    recruiter: 1,
    title: 'Machine Learning Engineer, LLM Platform',
    company: 'Lumen Health',
    location: 'Seattle, WA',
    remote: true,
    salaryMin: 180000,
    salaryMax: 240000,
    blindScreening: true,
    description: `About Lumen Health
We use AI to help clinicians spend more time with patients.

Requirements:
- 4+ years of experience in machine learning with Python and PyTorch
- Hands-on experience with LLMs, RAG and NLP
- MLOps: deploying and monitoring models on AWS with Docker

Nice to have:
- Airflow, Hugging Face
- Kubernetes experience is a plus`,
  },
  {
    recruiter: 1,
    title: 'Platform / DevOps Engineer',
    company: 'Lumen Health',
    location: 'London',
    remote: true,
    salaryMin: 90000,
    salaryMax: 120000,
    blindScreening: false,
    description: `The role
Own our cloud platform and developer experience.

Requirements:
- 5+ years of experience with Kubernetes and Terraform
- AWS or GCP in production
- CI/CD with GitHub Actions, observability with Prometheus and Grafana

Nice to have:
- Python or Go scripting, Linux internals`,
  },
  {
    recruiter: 0,
    title: 'Junior Frontend Developer',
    company: 'Northwind Labs',
    location: 'Berlin',
    remote: true,
    salaryMin: 50000,
    salaryMax: 65000,
    blindScreening: false,
    description: `Join our frontend guild and grow with mentorship.

Requirements:
- 1+ years of experience with JavaScript, React, HTML and CSS
- Eye for accessible UI

Nice to have:
- TypeScript, Tailwind CSS, Figma`,
  },
];

/** [candidateIndex, jobIndex, finalStage, daysAgoApplied, daysToOffer?] */
export const APPLICATIONS: [
  number,
  number,
  'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED',
  number,
  number?,
][] = [
  [0, 0, 'OFFER', 24, 14],
  [7, 0, 'INTERVIEW', 18],
  [3, 0, 'SCREENING', 9],
  [1, 0, 'APPLIED', 3],
  [5, 0, 'APPLIED', 2],
  [1, 1, 'OFFER', 28, 21],
  [4, 1, 'INTERVIEW', 12],
  [7, 1, 'SCREENING', 6],
  [6, 1, 'REJECTED', 15],
  [2, 2, 'OFFER', 20, 11],
  [5, 2, 'SCREENING', 8],
  [0, 2, 'APPLIED', 4],
  [3, 3, 'INTERVIEW', 10],
  [0, 3, 'APPLIED', 1],
  [4, 4, 'SCREENING', 5],
  [1, 4, 'APPLIED', 2],
];

export function renderResume(c: SeedCandidate): string {
  const lines = [
    c.name,
    c.headline,
    `${c.email} | +1 555 010 ${String(1000 + c.name.length * 37).slice(-4)} | ${c.location}`,
    '',
    'SUMMARY',
    c.summary,
    '',
    'SKILLS',
    c.skills.join(', '),
    '',
    'EXPERIENCE',
  ];
  for (const r of c.roles) {
    lines.push(`${r.title} — ${r.company} (${r.start} - ${r.end})`, ...r.bullets.map((b) => `- ${b}`));
  }
  lines.push('', 'EDUCATION', c.education);
  if (c.projects.length) lines.push('', 'PROJECTS', ...c.projects);
  return lines.join('\n') + '\n';
}
