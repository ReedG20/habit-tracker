import type { Infer } from 'convex/values';

import type { ContractRun } from '@/components/commitment/contract-text';
import type { SignedContract } from '@/convex/contracts';
import type { signatureValidator } from '@/convex/lib/contractSchema';

/** A finger signature as SVG paths, in the coordinates of the pad it was drawn on. */
export type Signature = Infer<typeof signatureValidator>;

/** What signing hands back: the short terms, and the signature under them. */
export type Signed = { terms: ContractRun[]; signature: Signature };

export type { SignedContract };
