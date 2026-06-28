output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "ecr_repository_url" {
  description = "The URL of the ECR repository for Docker pushes"
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "The public DNS name of the ALB to access the website"
  value       = aws_alb.main.dns_name
}

output "ecs_cluster_name" {
  description = "The name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "The name of the ECS Fargate service"
  value       = aws_ecs_service.main.name
}
