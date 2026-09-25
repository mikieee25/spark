export type MockFile = {
  id: string;
  name: string;
  kind: "folder" | "file";
  type: string;
  size: string;
  modified: string;
  owner: string;
  starred?: boolean;
  tone: "blue" | "yellow" | "purple" | "green" | "slate" | "red";
};

export const MOCK_FILES: MockFile[] = [
  {
    id: "energy-plans",
    name: "Energy Plans",
    kind: "folder",
    type: "Folder",
    size: "—",
    modified: "Today, 9:42 AM",
    owner: "DOE Planning",
    starred: true,
    tone: "blue",
  },
  {
    id: "operations",
    name: "Operations",
    kind: "folder",
    type: "Folder",
    size: "—",
    modified: "Yesterday",
    owner: "Operations",
    tone: "yellow",
  },
  {
    id: "research",
    name: "Research & Development",
    kind: "folder",
    type: "Folder",
    size: "—",
    modified: "Sep 18, 2026",
    owner: "R&D Office",
    tone: "purple",
  },
  {
    id: "quarterly-report",
    name: "Q3 Energy Outlook.pdf",
    kind: "file",
    type: "PDF document",
    size: "4.8 MB",
    modified: "Today, 8:16 AM",
    owner: "Maria Santos",
    starred: true,
    tone: "red",
  },
  {
    id: "budget-model",
    name: "FY2027 Budget Model.xlsx",
    kind: "file",
    type: "Spreadsheet",
    size: "1.2 MB",
    modified: "Yesterday, 4:25 PM",
    owner: "Finance",
    tone: "green",
  },
  {
    id: "briefing-notes",
    name: "Secretary Briefing Notes.docx",
    kind: "file",
    type: "Word document",
    size: "842 KB",
    modified: "Sep 19, 2026",
    owner: "Executive Office",
    tone: "blue",
  },
  {
    id: "site-map",
    name: "Regional Sites Map.png",
    kind: "file",
    type: "Image",
    size: "8.1 MB",
    modified: "Sep 17, 2026",
    owner: "Field Operations",
    tone: "purple",
  },
  {
    id: "readme",
    name: "Start here.txt",
    kind: "file",
    type: "Text file",
    size: "12 KB",
    modified: "Sep 12, 2026",
    owner: "SPARK System",
    tone: "slate",
  },
];

export const WORKSPACE_STATS = [
  {
    label: "Shared storage",
    value: "68.4 GB",
    detail: "of 1 TB allocated",
    progress: 7,
    tone: "blue",
  },
  {
    label: "Files this week",
    value: "24",
    detail: "+12% from last week",
    progress: 64,
    tone: "green",
  },
  {
    label: "Active collaborators",
    value: "8",
    detail: "3 online now",
    progress: 42,
    tone: "yellow",
  },
] as const;
