import type { RuleCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";

import { AccessPolicies, GateRows } from "./AccountRules";
import { Box, Divider, SECTIONS } from "./FlowLayout";
import type { RuleFlowModel } from "./rule-flow-model";
import { LessonMaterialRows, RuleRows } from "./RuleRows";
import { ScaffoldCard, UnavailableScaffolds } from "./ScaffoldRules";
import styles from "./RulesView.module.css";

export function RuleFlow({
  catalogue,
  flow,
}: Readonly<{ catalogue: RuleCatalogue; flow: RuleFlowModel }>) {
  const firstCapabilityBox = 5;
  const everyScaffoldBox = firstCapabilityBox + flow.capabilities.length;
  const eachScaffoldBox = everyScaffoldBox + 1;

  return (
    <>
      <Divider section={SECTIONS.lesson} />
      <ol className={styles.boxes}>
        <Box number={1} question="Does ORA appear on OWA's lesson page?">
          <p className={styles.lead}>
            ORA doesn&apos;t appear if any of these is true:
          </p>
          <RuleRows rows={flow.lesson} />
        </Box>
        <Box number={2} question="What does ORA leave out of the lesson?">
          <p className={styles.lead}>Scaffolds and suggestions don&apos;t read:</p>
          <LessonMaterialRows materials={catalogue.lessonMaterials} />
        </Box>
      </ol>

      <Divider section={SECTIONS.account} />
      <ol className={styles.boxes} start={3}>
        <Box number={3} question="What does the teacher need to do first?">
          <GateRows gates={catalogue.gates} />
        </Box>
        <Box number={4} question="How much can they adapt?">
          <AccessPolicies policies={catalogue.access} />
        </Box>
      </ol>

      <Divider section={SECTIONS.capability} />
      <ol className={styles.boxes} start={firstCapabilityBox}>
        {flow.capabilities.map(({ id, label, rules }, index) => (
          <Box
            key={id}
            number={firstCapabilityBox + index}
            question={`Is “${label}” offered?`}
          >
            <p className={styles.lead}>Not if any of these is true:</p>
            <RuleRows rows={rules} />
          </Box>
        ))}
      </ol>

      <Divider section={SECTIONS.everyScaffold} />
      <ol className={styles.boxes} start={everyScaffoldBox}>
        <Box number={everyScaffoldBox} question="What stops a scaffold being offered?">
          <p className={styles.lead}>Any of these, for every scaffold:</p>
          <RuleRows rows={flow.commonScaffoldRules} />
        </Box>
      </ol>

      <Divider section={SECTIONS.eachScaffold} />
      <ol className={styles.boxes} start={eachScaffoldBox}>
        <Box number={eachScaffoldBox} question="When is each scaffold not offered?">
          {flow.scaffolds.map((scaffold) => (
            <ScaffoldCard key={scaffold.kind} scaffold={scaffold} />
          ))}
          {flow.notOfferedScaffolds.length > 0 && (
            <UnavailableScaffolds scaffolds={flow.notOfferedScaffolds} />
          )}
        </Box>
      </ol>
    </>
  );
}
