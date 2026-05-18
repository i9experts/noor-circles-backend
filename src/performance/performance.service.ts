import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IsBoolean, IsInt, IsMongoId, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min,
} from 'class-validator';
import { Performance, PerformanceDocument } from './performance.schema';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';

export class SubmitReviewDto {
  @IsOptional()
  @IsMongoId({ message: 'Invalid murabbi ID.' })
  murabbiId?: string; // Admin use — submit on behalf of a murabbi

  @IsMongoId({ message: 'Invalid circle ID.' })
  circleId: string;

  @IsInt() @Min(1)
  sessionNumber: number;

  @IsOptional() @IsString() @MaxLength(1000)
  reviewText?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  stars?: number;

  @IsOptional() @IsBoolean()
  requiresFollowUp?: boolean;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  honestyScore?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  gratitudeScore?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  empathyScore?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  identityScore?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  familyScore?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  consistencyScore?: number;
}

const AVG_FIELDS = [
  'honestyScore', 'gratitudeScore', 'empathyScore',
  'identityScore', 'familyScore', 'consistencyScore',
] as const;

function avgField(reviews: any[], field: string) {
  return reviews.length > 0
    ? Math.round(reviews.reduce((s, r) => s + (Number(r[field]) || 0), 0) / reviews.length)
    : 0;
}

@Injectable()
export class PerformanceService {
  constructor(
    @InjectModel(Performance.name)
    private readonly performanceModel: Model<PerformanceDocument>,
    private readonly notifService: NotificationService,
  ) {}

  async submitReview(murabbiId: string, dto: SubmitReviewDto, reviewerId?: string) {
    const scores = [
      dto.honestyScore ?? 0, dto.gratitudeScore ?? 0, dto.empathyScore  ?? 0,
      dto.identityScore ?? 0, dto.familyScore ?? 0, dto.consistencyScore ?? 0,
    ];
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    const review = await this.performanceModel.create({
      murabbi          : new Types.ObjectId(murabbiId),
      circle           : new Types.ObjectId(dto.circleId),
      sessionNumber    : dto.sessionNumber,
      reviewText       : dto.reviewText       ?? '',
      stars            : dto.stars            ?? 0,
      requiresFollowUp : dto.requiresFollowUp ?? false,
      honestyScore     : dto.honestyScore     ?? 0,
      gratitudeScore   : dto.gratitudeScore   ?? 0,
      empathyScore     : dto.empathyScore     ?? 0,
      identityScore    : dto.identityScore    ?? 0,
      familyScore      : dto.familyScore      ?? 0,
      consistencyScore : dto.consistencyScore ?? 0,
    });

    // Notify murabbi only when an admin submits on their behalf
    if (reviewerId && reviewerId !== murabbiId) {
      const populated = await this.performanceModel
        .findById(review._id)
        .populate('circle', 'name')
        .lean();
      const circleName = (populated?.circle as any)?.name ?? 'your circle';

      this.notifService.create({
        recipient : murabbiId,
        sender    : reviewerId,
        type      : NotificationType.PERFORMANCE_REVIEW,
        title     : 'New Performance Review',
        message   : `You have received a performance review for Session #${dto.sessionNumber} (${circleName}). Overall score: ${overallScore}%.`,
        payload   : {
          reviewId        : (review._id as Types.ObjectId).toString(),
          sessionNumber   : dto.sessionNumber,
          stars           : dto.stars ?? 0,
          overallScore,
          circleName,
          reviewText      : dto.reviewText ?? '',
          requiresFollowUp: dto.requiresFollowUp ?? false,
          honestyScore    : dto.honestyScore ?? 0,
          gratitudeScore  : dto.gratitudeScore ?? 0,
          empathyScore    : dto.empathyScore ?? 0,
          identityScore   : dto.identityScore ?? 0,
          familyScore     : dto.familyScore ?? 0,
          consistencyScore: dto.consistencyScore ?? 0,
        },
      }).catch(() => {});
    }

    return { message: 'Review submitted successfully.', review };
  }

  getReviews(filters?: { circleId?: string; murabbiId?: string }) {
    const q: Record<string, any> = {};
    if (filters?.circleId)  q['circle']  = new Types.ObjectId(filters.circleId);
    if (filters?.murabbiId) q['murabbi'] = new Types.ObjectId(filters.murabbiId);

    return this.performanceModel
      .find(q)
      .populate('murabbi', 'fullName email')
      .populate('circle', 'name')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getIndicators() {
    const reviews = await this.performanceModel.find().lean();
    return {
      honestyScore    : avgField(reviews, 'honestyScore'),
      gratitudeScore  : avgField(reviews, 'gratitudeScore'),
      empathyScore    : avgField(reviews, 'empathyScore'),
      identityScore   : avgField(reviews, 'identityScore'),
      familyScore     : avgField(reviews, 'familyScore'),
      consistencyScore: avgField(reviews, 'consistencyScore'),
    };
  }

  async getSummary() {
    const reviews = await this.performanceModel
      .find()
      .populate('murabbi', 'fullName')
      .lean();

    const totalReviews  = reviews.length;
    const followUpCount = reviews.filter((r) => r.requiresFollowUp).length;
    const avgStars      = totalReviews > 0
      ? Math.round((reviews.reduce((s, r) => s + r.stars, 0) / totalReviews) * 10) / 10
      : 0;

    // Group by murabbi
    const murabbiMap = new Map<string, { name: string; reviews: typeof reviews }>();
    for (const r of reviews) {
      const id   = (r.murabbi as any)?._id?.toString() ?? 'unknown';
      const name = (r.murabbi as any)?.fullName ?? 'Unknown';
      if (!murabbiMap.has(id)) murabbiMap.set(id, { name, reviews: [] });
      murabbiMap.get(id)!.reviews.push(r);
    }

    const murabbiBreakdown = [...murabbiMap.entries()].map(([murabbiId, data]) => {
      const r = data.reviews;
      return {
        murabbiId,
        murabbiName     : data.name,
        reviewCount     : r.length,
        followUps       : r.filter((x) => x.requiresFollowUp).length,
        avgStars        : r.length > 0
          ? Math.round((r.reduce((s, x) => s + x.stars, 0) / r.length) * 10) / 10
          : 0,
        honestyScore    : avgField(r, 'honestyScore'),
        gratitudeScore  : avgField(r, 'gratitudeScore'),
        empathyScore    : avgField(r, 'empathyScore'),
        identityScore   : avgField(r, 'identityScore'),
        familyScore     : avgField(r, 'familyScore'),
        consistencyScore: avgField(r, 'consistencyScore'),
      };
    });

    return {
      totalReviews,
      followUpCount,
      avgStars,
      murabbiCount: murabbiMap.size,
      murabbiBreakdown,
    };
  }

  async deleteReview(id: string) {
    const r = await this.performanceModel.findByIdAndDelete(id).lean();
    if (!r) throw new NotFoundException('Review not found.');
    return { message: 'Review deleted.' };
  }

  async resolveFollowUp(id: string) {
    const r = await this.performanceModel
      .findByIdAndUpdate(id, { $set: { requiresFollowUp: false } }, { new: true })
      .lean();
    if (!r) throw new NotFoundException('Review not found.');
    return { message: 'Follow-up resolved.', review: r };
  }

  getMyReviews(murabbiId: string) {
    return this.performanceModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .populate('circle', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  }
}
