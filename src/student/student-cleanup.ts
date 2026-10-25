import { Model, Types } from 'mongoose';
import { StudentDocument } from './student.schema';
import { AttendanceDocument } from '../attendance/attendance.schema';
import { IncentiveDocument } from '../incentive/incentive.schema';
import { ParentDocument } from '../parent/parent.schema';

export interface StudentCleanupModels {
  studentModel   : Model<StudentDocument>;
  attendanceModel: Model<AttendanceDocument>;
  incentiveModel : Model<IncentiveDocument>;
  parentModel    : Model<ParentDocument>;
}

/**
 * Deletes a student and everything that points at them: their entries in
 * attendance sessions (sessions left empty are removed), their points, and
 * their links from parent records. Returns the deleted student, or null.
 */
export async function deleteStudentCascade(m: StudentCleanupModels, id: string) {
  const student = await m.studentModel.findByIdAndDelete(id).lean();
  if (!student) return null;
  const oid = new Types.ObjectId(id);
  await Promise.all([
    m.attendanceModel.updateMany({ 'records.student': oid }, { $pull: { records: { student: oid } } }),
    m.incentiveModel.deleteMany({ student: oid }),
    m.parentModel.updateMany({ students: oid }, { $pull: { students: oid } }),
  ]);
  await m.attendanceModel.deleteMany({ records: { $size: 0 } });
  return student;
}
