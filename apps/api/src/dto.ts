import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, IsNumber, Max, Min } from "class-validator";

export class LoginDto {
  @IsString() @MinLength(3) @Matches(/^[a-zA-Z0-9._-]{3,30}$/) username!: string;
  @IsString() @MinLength(10) password!: string;
}

export class RegisterDto extends LoginDto {}

export class DecisionDto {
  @IsIn(["ACCEPT", "REJECT"]) decision!: "ACCEPT" | "REJECT";
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class WeightDto {
  @IsNumber() @Min(1) @Max(100000) grams!: number;
}

export class CheckoutDto {
  @IsIn(["PLUS", "HOUSEHOLD"]) planCode!: "PLUS" | "HOUSEHOLD";
  @IsIn(["tok_demo_visa", "tok_demo_declined"]) paymentMethodToken!: "tok_demo_visa" | "tok_demo_declined";
}
