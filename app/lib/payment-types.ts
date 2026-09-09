export type BankTransferConfig = {
  bankName: string;
  accountName: string;
  clabe: string;
  referencePrefix: string;
};

export function formatClabe(clabe: string) {
  return clabe.replace(/(\d{3})(\d{3})(\d{11})(\d)/, "$1 $2 $3 $4");
}
