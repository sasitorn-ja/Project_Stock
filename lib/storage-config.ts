import { hasSharedDatabase } from "@/lib/postgres-storage";

export type StorageStatus = {
  mode: "local-file" | "postgres";
  shared: boolean;
  hosted: boolean;
  writable: boolean;
  message: string;
};

export function getStorageStatus(): StorageStatus {
  const hosted = Boolean(process.env.VERCEL);
  const sharedDatabase = hasSharedDatabase();

  if (sharedDatabase) {
    return {
      mode: "postgres",
      shared: true,
      hosted,
      writable: true,
      message:
        "ระบบกำลังใช้ฐานข้อมูลกลางผ่าน DATABASE_URL ข้อมูลจะเห็นร่วมกันทุกเครื่องและพร้อมสำหรับการใช้งานจริงหลายผู้ใช้",
    };
  }

  if (hosted) {
    return {
      mode: "local-file",
      shared: false,
      hosted: true,
      writable: false,
      message:
        "ระบบนี้ยังใช้ local file storage ซึ่งไม่เหมาะกับ Vercel และไม่แชร์ข้อมูลข้ามอุปกรณ์ กรุณาเปลี่ยนไปใช้ฐานข้อมูลกลางก่อนใช้งานจริงหลายคน",
    };
  }

  return {
    mode: "local-file",
    shared: false,
    hosted: false,
    writable: true,
    message:
      "ระบบกำลังใช้ local file storage บนเครื่องนี้ ข้อมูลจะเห็นร่วมกันเฉพาะ instance เดียวกันเท่านั้น",
  };
}

export function assertWritableStorage() {
  const status = getStorageStatus();

  if (!status.writable) {
    throw new Error(status.message);
  }

  return status;
}
