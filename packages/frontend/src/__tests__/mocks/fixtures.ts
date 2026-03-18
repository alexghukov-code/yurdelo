export const USERS = {
  admin: {
    id: 'u-admin',
    email: 'admin@test.ru',
    role: 'admin' as const,
    firstName: 'Алексей',
    lastName: 'Иванов',
    twoFaEnabled: false,
  },
  lawyer: {
    id: 'u-lawyer',
    email: 'lawyer@test.ru',
    role: 'lawyer' as const,
    firstName: 'Мария',
    lastName: 'Петрова',
    twoFaEnabled: false,
  },
  viewer: {
    id: 'u-viewer',
    email: 'viewer@test.ru',
    role: 'viewer' as const,
    firstName: 'Анна',
    lastName: 'Козлова',
    twoFaEnabled: false,
  },
};

export const PARTIES = [
  { id: 'p1', name: 'ООО Альфа', inn: '1234567890', createdAt: '', updatedAt: '' },
  { id: 'p2', name: 'ИП Смирнов', inn: null, createdAt: '', updatedAt: '' },
];

const NOW = new Date().toISOString();

export const CASES = {
  own: {
    id: 'c1',
    name: 'Своё дело',
    category: 'civil',
    status: 'active',
    finalResult: null,
    claimAmount: 100000,
    lawyerId: 'u-lawyer',
    pltId: 'p1',
    defId: 'p2',
    pltName: 'ООО Альфа',
    defName: 'ИП Смирнов',
    lawyerName: 'Петрова Мария',
    closedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    stages: [
      {
        id: 's1',
        stageTypeId: 'a0000000-0000-0000-0000-000000000002',
        stageTypeName: '1-я инстанция',
        sortOrder: 2,
        court: 'Арбитражный суд г. Москвы',
        caseNumber: 'А40-12345/2025',
        createdAt: NOW,
        updatedAt: NOW,
        hearings: [
          {
            id: 'h1',
            stageId: 's1',
            type: 'hearing',
            datetime: '2026-04-15T10:00:00Z',
            result: null,
            appealed: null,
            newDatetime: null,
            adjReason: null,
            notes: null,
            documents: [
              {
                id: 'd1',
                fileName: 'contract.pdf',
                fileSize: 12345,
                mimeType: 'application/pdf',
                uploadedBy: 'u-lawyer',
                createdAt: NOW,
              },
            ],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      },
    ],
  },
  other: {
    id: 'c2',
    name: 'Чужое дело',
    category: 'arbitration',
    status: 'active',
    finalResult: null,
    claimAmount: 500000,
    lawyerId: 'u-other',
    pltId: 'p2',
    defId: 'p1',
    pltName: 'ИП Смирнов',
    defName: 'ООО Альфа',
    lawyerName: 'Сидоров Пётр',
    closedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    stages: [],
  },
};

export const EMPTY_LIST = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
export const EMPTY_NOTIFICATIONS = { data: [], meta: { unreadCount: 0 } };
export const EMPTY_REPORT = {
  data: {
    load: { activeCases: 0, closedCases: 0, totalCases: 0 },
    results: { wins: 0, losses: 0, partial: 0, decided: 0, winRate: null },
  },
};
