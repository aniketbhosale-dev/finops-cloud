variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR network segment block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "environment" {
  description = "Application runtime deployment boundary tag"
  type        = string
  default     = "production"
}

variable "container_port" {
  description = "Port exposed by the Docker container application"
  type        = number
  default     = 4321
}
