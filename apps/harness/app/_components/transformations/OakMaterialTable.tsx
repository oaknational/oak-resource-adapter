import { oakMaterialUsage } from "./oak-material-usage";
import type { TransformationWorkbench } from "./useTransformationWorkbench";
import styles from "../../page.module.css";

type OakMaterialTableProps = Pick<
  TransformationWorkbench,
  "catalogue" | "materialCatalogue"
>;

export function OakMaterialTable({
  catalogue,
  materialCatalogue,
}: OakMaterialTableProps) {
  const usage = oakMaterialUsage(materialCatalogue, catalogue);

  return (
    <section
      aria-labelledby="oak-material-heading"
      className={styles.resultPanel}
      id="oak-material"
    >
      <h2 id="oak-material-heading">Oak lesson material</h2>
      <p>
        Beyond the resource itself, a transformation can ask for parts of the Oak lesson
        it came from. Each transformation declares the parts it wants, and they reach
        the model through one <code>{"{{lessonMaterial}}"}</code> placeholder in its
        prompt.
      </p>

      <div className={styles.tableScroll}>
        <table className={styles.materialTable}>
          <caption>
            All {usage.length} parts, and which transformations use them
          </caption>
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Appears in the prompt as</th>
              <th scope="col">Declared as</th>
              <th scope="col">Status</th>
              <th scope="col">Asked for by</th>
            </tr>
          </thead>
          <tbody>
            {usage.map(({ part, usedBy }) => (
              <tr key={part.key}>
                <th scope="row">{part.label}</th>
                <td>
                  <code>{part.promptHeading}</code>
                </td>
                <td>
                  <code>{part.key}</code>
                </td>
                <td>
                  {part.available ? (
                    "Available"
                  ) : (
                    <>
                      Not yet
                      {part.unavailableBecause !== undefined && (
                        <> — {part.unavailableBecause}</>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {usedBy.length === 0 ? (
                    "Nothing yet"
                  ) : (
                    <ul className={styles.usageList}>
                      {usedBy.map(({ label, required }) => (
                        <li key={label}>
                          {label}
                          {required && (
                            <span className={styles.requiredTag}>required</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
