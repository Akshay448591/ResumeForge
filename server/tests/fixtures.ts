import { emptyContent, newId, type ResumeContent } from '../src/schema/resume.js';

export function sampleContent(): ResumeContent {
  const c = emptyContent();
  c.personal = {
    fullName: 'Priya Nair',
    title: 'Senior Backend Engineer',
    email: 'priya.nair@example.com',
    phone: '+91 98765 43210',
    location: 'Pune, India',
    links: [
      { id: newId(), label: 'GitHub', url: 'github.com/priyanair', visible: true },
      { id: newId(), label: 'Portfolio', url: 'https://example.com/portfolio', visible: true },
    ],
    show: { email: true, phone: true, location: true },
  };
  c.summary =
    'Backend engineer with six years of experience building payment APIs in Node.js and Go. Known for cutting checkout failures and mentoring junior developers.';
  c.experience = [
    {
      id: newId(),
      company: 'Acme Payments',
      role: 'Senior Software Engineer',
      location: 'Pune',
      startDate: '2022-01',
      endDate: '',
      current: true,
      bullets: [
        {
          id: newId(),
          text: 'Cut checkout failures by 30% by redesigning retry logic across three services.',
        },
        { id: newId(), text: 'Mentored four junior developers and ran the weekly design review.' },
      ],
    },
    {
      id: newId(),
      company: 'Beta Labs',
      role: 'Software Engineer',
      location: 'Remote',
      startDate: '2019-06',
      endDate: '2021-12',
      current: false,
      bullets: [
        { id: newId(), text: 'Built the invoicing service used by twenty thousand customers.' },
      ],
    },
  ];
  c.education = [
    {
      id: newId(),
      institution: 'Savitribai Phule Pune University',
      degree: 'B.Tech',
      field: 'Computer Engineering',
      startDate: '2015-08',
      endDate: '2019-05',
      grade: '8.7 CGPA',
      description: '',
      achievements: [],
    },
  ];
  c.skills = [
    { id: newId(), name: 'Node.js', kind: 'technical' },
    { id: newId(), name: 'TypeScript', kind: 'technical' },
    { id: newId(), name: 'PostgreSQL', kind: 'technical' },
    { id: newId(), name: 'Mentoring', kind: 'soft' },
  ];
  c.languages = [{ id: newId(), name: 'English', level: 'Fluent' }];
  return c;
}

/** A resume long enough to need several pages, with short, easily-checked entries. */
export function longContent(entries = 16): ResumeContent {
  const c = sampleContent();
  c.experience = Array.from({ length: entries }, (_, i) => ({
    id: newId(),
    company: `Company${i + 1} Holdings`,
    role: `Engineer Level${i + 1}`,
    location: 'Remote',
    startDate: `20${String(i).padStart(2, '0')}-01`,
    endDate: `20${String(i).padStart(2, '0')}-12`,
    current: false,
    bullets: [
      {
        id: newId(),
        text: `Bullet${i + 1}a delivered measurable improvements to reliability and speed for the platform team.`,
      },
      {
        id: newId(),
        text: `Bullet${i + 1}b collaborated with design and product to ship the quarterly roadmap on time.`,
      },
    ],
  }));
  return c;
}
