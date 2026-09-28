import type { TransformationStatus } from "../transformations/transformation-api";
import styles from "../../page.module.css";

const statusStyles = {
  active: styles.activeStatus,
  draft: styles.draftStatus,
  retired: styles.retiredStatus,
} satisfies Record<TransformationStatus, string | undefined>;

export function statusBadgeClass(status: TransformationStatus): string {
  return `${styles.statusBadge} ${statusStyles[status]}`;
}
