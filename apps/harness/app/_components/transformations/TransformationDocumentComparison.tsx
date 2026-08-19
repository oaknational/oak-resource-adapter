import { ResourceDocumentInspector } from "./ResourceDocumentInspector";
import type { TransformationWorkbench } from "./useTransformationWorkbench";
import styles from "../../page.module.css";

type TransformationDocumentComparisonProps = Pick<
  TransformationWorkbench,
  "currentDocument" | "outputDocument"
>;

export function TransformationDocumentComparison({
  currentDocument,
  outputDocument,
}: TransformationDocumentComparisonProps) {
  return (
    <div className={styles.documentComparison}>
      <ResourceDocumentInspector
        compareWith={outputDocument}
        document={currentDocument}
        label="Current input"
        missingChange="removed"
      />
      {outputDocument !== undefined && (
        <ResourceDocumentInspector
          compareWith={currentDocument}
          document={outputDocument}
          label="Transformation output"
        />
      )}
    </div>
  );
}
