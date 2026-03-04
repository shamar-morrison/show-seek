import type { CrewMember } from '@/src/api/tmdb';

export interface MergedCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface MergedCrewAccumulator {
  id: number;
  name: string;
  department: string;
  profile_path: string | null;
  jobs: string[];
  seenJobs: Set<string>;
}

/**
 * Merge duplicate crew rows by person id while preserving the original API order.
 */
export const mergeCrewMembersByPerson = (crew: CrewMember[]): MergedCrewMember[] => {
  const merged = new Map<number, MergedCrewAccumulator>();

  for (const member of crew) {
    const existing = merged.get(member.id);

    if (!existing) {
      merged.set(member.id, {
        id: member.id,
        name: member.name,
        department: member.department,
        profile_path: member.profile_path,
        jobs: member.job ? [member.job] : [],
        seenJobs: member.job ? new Set([member.job]) : new Set<string>(),
      });
      continue;
    }

    if (!existing.profile_path && member.profile_path) {
      existing.profile_path = member.profile_path;
    }

    if (member.job && !existing.seenJobs.has(member.job)) {
      existing.jobs.push(member.job);
      existing.seenJobs.add(member.job);
    }
  }

  return Array.from(merged.values()).map((member) => ({
    id: member.id,
    name: member.name,
    department: member.department,
    profile_path: member.profile_path,
    job: member.jobs.join(' • '),
  }));
};
