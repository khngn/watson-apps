#!/usr/bin/env tsx
// #!/usr/bin/env -S dotenvx run -f private.env --overload --verbose -- tsx
import { DateTimeFormatter, ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import * as fs from 'fs';
import path, { basename } from 'path';

const args = process.argv.slice(2);
const env = args[0] || 'E1';
// args
const email = 'brian.kavanagh@homeaffairs.gov.au'
const inputEdi = [
  'AIRIAR-IAR-Original.edi',
  'BUG309849.edi',
  'BUG311124.edi',
  'BUG309848.edi',
  'AIRIAR-IAR-Original-big.edi',
];
const ediFile = inputEdi[0];
const numFilesToGenerate = 1;
// #################################################################################
const ensureDir = (dir: string): string => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const dataDir = ensureDir(path.resolve(__dirname, '..', 'data'));
const certsDir = path.resolve(__dirname, '..', 'certs');
const ediDir = path.resolve(__dirname, '..', 'edi');
const readFileText = (...filePaths: string[]): string => fs.readFileSync(path.join(...filePaths), 'utf-8');
const readCertFile = (fileName: string): string => readFileText(certsDir, fileName);

const zoneId = ZoneId.of('Australia/Canberra');
const dateTimeFormatter = DateTimeFormatter.ofPattern('yyyyMMdd_HHmmss_SSS');

const generate = async (ediFile: string, icrNum: number): Promise<string> => {
  // const ediFile = 'AIRIAR-IAR-Original.edi';
  const timestamp = ZonedDateTime.now(zoneId).format(dateTimeFormatter);
  // const randomeSuffix = Math.random().toString(36).substring(2, 8);
  const index = inputEdi.indexOf(ediFile);
  const outFile = path.join(dataDir, `knesg_${timestamp}_${index}_${icrNum}`);

  const content = {
    fromEmailAddress: email,
    toEmailAddress: 'person@email.com',
    subject: `EDIKN_${basename(outFile)}`,
    attachmentName: basename(outFile),
    contentType: 'application/EDIFACT',
    message: readFileText(ediDir, ediFile).replaceAll('${icr}', `${icrNum}`),
    sign: true,
    signingX509: readCertFile(`${email}.cer`),
    signingPkcs8: readCertFile(`${email}.encrypted.pkcs8`),
    signingPkcs8Password: 'password',
    encrypt: true,
    encryptX509: readCertFile(`edi-access-${env}.cer`)
  };

  fs.writeFileSync(outFile, JSON.stringify(content, undefined, 2));
  return outFile;
}

const main = async () => {
  const icrFile = path.join(ediDir, `${ediFile}.${env}.icr`);
  const lastIcrNum = Number(readFileText(icrFile).trim());
  let count = 0;

  try {
    while (++count <= numFilesToGenerate) {
      const outFile = await generate(ediFile, lastIcrNum + count);
      console.log(`Generated file[${count}]: ${outFile}`);
    }
  } finally {
      fs.writeFileSync(icrFile, `${lastIcrNum + count - 1}`, 'utf-8');
  }
}

main().catch((error) => {
  console.error('An error occurred:', error);
  process.exit(1);
}).finally(() => {
  console.log('Generation process completed.');
});