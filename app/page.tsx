import Studio from "./studio";
import { currentBankVersion, testCatalog } from "../lib/catalog";

export default function Page() {
  return <Studio catalog={testCatalog} bankVersion={currentBankVersion} />;
}
