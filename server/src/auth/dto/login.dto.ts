import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
