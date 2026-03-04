import { mergeCrewMembersByPerson } from '@/src/utils/credits';

describe('mergeCrewMembersByPerson', () => {
  it('merges duplicate people while preserving first-seen order', () => {
    const crew = [
      {
        id: 10,
        name: 'First Person',
        job: 'Director',
        department: 'Directing',
        profile_path: '/one.jpg',
      },
      {
        id: 20,
        name: 'Second Person',
        job: 'Writer',
        department: 'Writing',
        profile_path: '/two.jpg',
      },
      {
        id: 10,
        name: 'First Person',
        job: 'Producer',
        department: 'Production',
        profile_path: '/one-alt.jpg',
      },
    ];

    const result = mergeCrewMembersByPerson(crew);

    expect(result.map((member) => member.id)).toEqual([10, 20]);
    expect(result[0]?.job).toBe('Director • Producer');
    expect(result[1]?.job).toBe('Writer');
  });

  it('deduplicates repeated jobs while keeping encounter order', () => {
    const crew = [
      {
        id: 5,
        name: 'Crew Person',
        job: 'Writer',
        department: 'Writing',
        profile_path: null,
      },
      {
        id: 5,
        name: 'Crew Person',
        job: 'Writer',
        department: 'Writing',
        profile_path: null,
      },
      {
        id: 5,
        name: 'Crew Person',
        job: 'Story',
        department: 'Writing',
        profile_path: null,
      },
    ];

    const result = mergeCrewMembersByPerson(crew);

    expect(result).toHaveLength(1);
    expect(result[0]?.job).toBe('Writer • Story');
  });

  it('uses first available non-null profile path when first entry has null profile', () => {
    const crew = [
      {
        id: 42,
        name: 'Crew Person',
        job: 'Editor',
        department: 'Editing',
        profile_path: null,
      },
      {
        id: 42,
        name: 'Crew Person',
        job: 'Writer',
        department: 'Writing',
        profile_path: '/profile.jpg',
      },
    ];

    const result = mergeCrewMembersByPerson(crew);

    expect(result).toHaveLength(1);
    expect(result[0]?.profile_path).toBe('/profile.jpg');
    expect(result[0]?.job).toBe('Editor • Writer');
  });

  it('returns an empty array when input is empty', () => {
    expect(mergeCrewMembersByPerson([])).toEqual([]);
  });
});
